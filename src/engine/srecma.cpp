/***************************************************************************

    srecma.cpp: Sound recorder using Miniaudio

    Primary Author: Ben Stone
    Review Status:

***************************************************************************/
#include "soc.h"

ASSERTNAME

#include "sndma.h"

RTCLASS(SREC)

void SREC::OnDataProc(ma_device *pDevice, void *pOutput, const void *pInput, ma_uint32 frameCount)
{
    Assert(pDevice != pvNil, "nil device");
    Assert(pInput != pvNil, "nil pInput");

    PSREC psrec = (PSREC)pDevice->pUserData;
    AssertPo(psrec, 0);
    if (psrec == pvNil)
        return;

    if (!psrec->_fRecording || psrec->_fHaveSound)
        return;

    bool fFinish = fFalse;
    ma_uint32 cFrameMac = psrec->_cFrameMac - psrec->_cFrame;
    AssertIn(cFrameMac, 0, klwMax);
    if (frameCount >= cFrameMac)
    {
        frameCount = cFrameMac;
        fFinish = fTrue;
    }

    int32_t cbChunk = psrec->_cbSample * frameCount;
    int32_t cbHq = CbOfHq(psrec->_hqBuffer);
    if (cbChunk + psrec->_ibBuffer > cbHq)
    {
        if (!FResizePhq(&psrec->_hqBuffer, cbHq + cbChunk, fmemNil, mprNormal))
        {
            Bug("Could not resize HQ for sound recording");
            return;
        }
    }

    uint8_t *pv = (uint8_t *)PvLockHq(psrec->_hqBuffer);
    if (pv != pvNil)
    {
        CopyPb(pInput, pv + psrec->_ibBuffer, cbChunk);
        psrec->_ibBuffer += cbChunk;
        UnlockHq(psrec->_hqBuffer);
    }
    else
    {
        Bug("Failed to lock HQ for sound recording");
        return;
    }

    psrec->_cFrame += frameCount;

    if (fFinish)
        psrec->_fHaveSound = fTrue;
}

/***************************************************************************
    Create a new SREC
***************************************************************************/
PSREC SREC::PsrecNew(int32_t csampSec, int32_t cchan, int32_t cbSample, uint32_t dtsMax)
{
    PSREC psrec;

    psrec = NewObj(SREC);
    if (pvNil == psrec)
        return pvNil;
    if (!psrec->_FInit(csampSec, cchan, cbSample, dtsMax))
    {
        ReleasePpo(&psrec);
        return pvNil;
    }
    AssertPo(psrec, 0);
    return psrec;
}

/***************************************************************************
    Init this SREC
***************************************************************************/
bool SREC::_FInit(int32_t csampSec, int32_t cchan, int32_t cbSample, uint32_t dtsMax)
{
    AssertBaseThis(0);
    AssertIn(cchan, 0, ksuMax);

    int32_t cwid;
    STN stnPath;
    ma_result result;

    _csampSec = csampSec;
    _cchan = cchan;
    _cbSample = cbSample;
    _dtsMax = dtsMax;
    _fBufferAdded = fFalse;
    _fRecording = fFalse;
    _fHaveSound = fFalse;
    _fInitDevice = fFalse;

    // Currently only 8-bit audio is supported
    _format = ma_format_u8;
    Assert(ma_get_bytes_per_frame(_format, _cchan) == cbSample, "cbSample is incorrect");

    // Maximum number of frames
    _cFrameMac = (dtsMax * csampSec) / kdtsSecond;

    int32_t cb = _cFrameMac * _cchan * _cbSample;
    if (!FAllocHq(&_hqBuffer, cb, fmemClear, mprNormal))
    {
        return fFalse;
    }

    // Initialise the device
    AssertVar(cbSample == 1, "Unsupported cbSample", &cbSample);
    ma_device_config deviceConfig = ma_device_config_init(ma_device_type_capture);
    deviceConfig.capture.format = _format;
    deviceConfig.capture.channels = _cchan;
    deviceConfig.sampleRate = _csampSec;
    deviceConfig.dataCallback = OnDataProc;
    deviceConfig.pUserData = this;

    result = ma_device_init(NULL, &deviceConfig, &_device);
    AssertVar(result == MA_SUCCESS, "ma_device_init failed", &result);
    if (result == MA_SUCCESS)
    {
        _fInitDevice = fTrue;
    }

    return _fInitDevice;
}

/***************************************************************************
    Clean up and delete this SREC
***************************************************************************/
SREC::~SREC(void)
{
    AssertBaseThis(0);

    // make sure nothing is playing or recording
    if (_fRecording || _fPlaying)
        FStop();

    if (_fInitPlaybackSound)
        ma_sound_uninit(&_sound);
    if (_fInitPlaybackBuffer)
    {
        ma_audio_buffer_uninit(&_playbackBuffer);
        UnlockHq(_hqBuffer);
    }

    if (_fInitDevice)
        ma_device_uninit(&_device);

    FreePhq(&_hqBuffer);
}

/***************************************************************************
    Start recording
***************************************************************************/
bool SREC::FStart(void)
{
    AssertThis(0);
    Assert(!_fRecording, "stop previous recording first");
    Assert(_fInitDevice, "device must be initialised");

    ma_result result;

    if (ma_device_is_started(&_device))
    {
        ma_device_stop(&_device);
    }

    // Reset state
    _fHaveSound = fFalse;
    _cFrame = 0;
    _ibBuffer = 0;

    // Start streaming audio
    result = ma_device_start(&_device);
    _fRecording = (result == MA_SUCCESS);
    AssertVar(_fRecording, "ma_device_start failed", &result);

    return _fRecording;
}

/***************************************************************************
    Stop recording or playing
***************************************************************************/
bool SREC::FStop(void)
{
    AssertThis(0);
    Assert(_fRecording || _fPlaying, "Nothing to stop");

    bool fStopped = fFalse;
    ma_result result;

    if (_fRecording)
    {
        result = ma_device_stop(&_device);
        AssertVar(MA_SUCCESS == result, "ma_device_stop failed", &result);

        _fRecording = fFalse;
        _fHaveSound = fTrue;
        fStopped = fTrue;
    }
    else if (_fPlaying)
    {
        result = ma_sound_stop(&_sound);
        AssertVar(result == MA_SUCCESS, "ma_sound_stop failed", &result);
        _fPlaying = fFalse;
        fStopped = fTrue;
    }

    return fStopped;
}

/***************************************************************************
    Start playing the current sound
***************************************************************************/
bool SREC::FPlay(void)
{
    AssertThis(0);
    Assert(_fHaveSound, "No sound to play");
    Assert(!_fPlaying, "Already playing");

    ma_result result = MA_SUCCESS;
    void *pvFrames = pvNil;

    // Reinitialise the playback buffer/sound
    if (_fInitPlaybackSound)
    {
        ma_sound_uninit(&_sound);
        _fInitPlaybackSound = fFalse;
    }
    if (_fInitPlaybackBuffer)
    {
        ma_audio_buffer_uninit(&_playbackBuffer);
        UnlockHq(_hqBuffer);
        _fInitPlaybackBuffer = fFalse;
    }

    pvFrames = PvLockHq(_hqBuffer);
    if (pvFrames != pvNil)
    {
        // Create the playback buffer
        ma_audio_buffer_config config = ma_audio_buffer_config_init(_format, _cchan, _cFrame, pvFrames, pvNil);
        config.sampleRate = _csampSec;
        result = ma_audio_buffer_init(&config, &_playbackBuffer);
        if (result == MA_SUCCESS)
        {
            _fInitPlaybackBuffer = fTrue;
        }
        else
        {
            BugVar("ma_audio_buffer_init failed", &result);
            UnlockHq(_hqBuffer);
        }
    }

    if (result == MA_SUCCESS)
    {
        // Create the sound
        ma_engine *pengine = MiniaudioManager::Pmanager()->Pengine();
        Assert(pengine != pvNil, "no engine");

        result = ma_sound_init_from_data_source(pengine, &_playbackBuffer, 0, pvNil, &_sound);
        if (result == MA_SUCCESS)
        {
            _fInitPlaybackSound = fTrue;
        }
        else
        {
            BugVar("ma_sound_init_from_data_source failed", &result);
        }
    }

    if (result == MA_SUCCESS)
    {
        // Play the sound
        result = ma_sound_start(&_sound);
        AssertVar(result == MA_SUCCESS, "ma_sound_start failed", &result);
        _fPlaying = (ma_sound_is_playing(&_sound));
    }

    return _fPlaying;
}

/***************************************************************************
    Are we recording?
***************************************************************************/
bool SREC::FRecording(void)
{
    AssertThis(0);

    // Check if we reached the end of the recording
    if (_fRecording && _fHaveSound)
    {
        AssertDo(FStop(), "can't stop");
    }

    return _fRecording;
}

/***************************************************************************
    Are we playing the current sound?
***************************************************************************/
bool SREC::FPlaying(void)
{
    AssertThis(0);

    // Check if we are still playing
    if (_fPlaying)
    {
        if (!ma_sound_is_playing(&_sound))
        {
            _fPlaying = fFalse;
        }
    }

    return _fPlaying;
}

/***************************************************************************
    Save the current sound to the given FNI
***************************************************************************/
bool SREC::FSave(PFNI pfni)
{
    AssertThis(0);
    Assert(_fHaveSound, "Nothing to save!");

    ma_result result;
    bool fRet = fFalse, fInitEncoder = fFalse;
    void *pvFrames = pvNil;
    ma_uint64 cframeWritten = 0;
    STN stnPath;
    ma_encoder encoder;
    ma_encoder_config encoderConfig;

    pfni->GetStnPath(&stnPath);

    pvFrames = PvLockHq(_hqBuffer);
    if (pvFrames == pvNil)
        goto LFail;

    // Create the encoder
    encoderConfig = ma_encoder_config_init(ma_encoding_format_wav, _format, _cchan, _csampSec);

#if defined(UNICODE)
    result = ma_encoder_init_file_w(stnPath.Psz(), &encoderConfig, &encoder);
#else // !UNICODE
    result = ma_encoder_init_file(stnPath.Psz(), &encoderConfig, &encoder);
#endif
    AssertVar(result == MA_SUCCESS, "Failed to initialise encoder", &result);
    if (result != MA_SUCCESS)
        goto LFail;

    fInitEncoder = fTrue;

    // Write all of the frames to the encoder
    result = ma_encoder_write_pcm_frames(&encoder, pvFrames, _cFrame, &cframeWritten);
    AssertVar(result == MA_SUCCESS, "Failed to write PCM frames", &result);
    Assert(cframeWritten == _cFrame, "Did not write all frames");
    if (result != MA_SUCCESS)
        goto LFail;

    fRet = fTrue;

LFail:

    if (fInitEncoder)
    {
        // If we wrote frames this will flush to disk
        ma_encoder_uninit(&encoder);

        // If we didn't succeed, delete the temp file
        if (!fRet)
            AssertDo(pfni->FDelete(), "Couldn't delete the temporary file");
    }

    if (pvFrames != pvNil)
        UnlockHq(_hqBuffer);

    return fRet;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of the SREC.
***************************************************************************/
void SREC::AssertValid(uint32_t grf)
{
    SREC_PAR::AssertValid(fobjAllocated);
}

/***************************************************************************
    Mark memory used by the SREC
***************************************************************************/
void SREC::MarkMem(void)
{
    AssertThis(0);
    SREC_PAR::MarkMem();
    MarkHq(_hqBuffer);
}
#endif // DEBUG
