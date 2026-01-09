/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Miniaudio sound playback device

***************************************************************************/
#include "frame.h"
ASSERTNAME

#define AssertMaSuccess(var, msg) AssertVar(var == MA_SUCCESS, msg, &var)

/***************************************************************************
    Number of milliseconds after playing a new sound that pause will be
    ignored.
    This is a hack to work around a difference in behaviour in AudioMan.
    When AudioMan plays a sound it will mix and write a chunk of the sound
    to the sound device immediately.
    When a GOB is clicked and destroyed, the mouse sound is played and
    immediately stopped.
    So, if a sound is played and immediately stopped, we ignore pause/stop
    requests for a short time.
***************************************************************************/
const int32_t kdtsDebounce = 100;

#include "sndma.h"
#include "sndmapri.h"

/***************************************************************************
    Read callback for ma_decoder that reads from a BLCK
***************************************************************************/
static ma_result BlockRead(ma_decoder *pdecoder, void *pvBufferOut, size_t cbRead, size_t *pcbBytesRead)
{
    Assert(pdecoder != pvNil, "no decoder");
    Assert(pvBufferOut != pvNil, "no buffer");
    Assert(pcbBytesRead != pvNil, "no bytes read");

    ma_result result = MA_SUCCESS;
    BLCKReadContext *pcontext = pvNil;

    if (pdecoder == pvNil || pdecoder->pUserData == pvNil || pcbBytesRead == pvNil)
    {
        return MA_IO_ERROR;
    }

    pcontext = (BLCKReadContext *)pdecoder->pUserData;
    Assert(pcontext != pvNil, "no context");
    AssertPo(pcontext->pblck, 0);

    size_t cbRemaining = pcontext->pblck->Cb() - pcontext->ib;
    if (cbRemaining < cbRead)
    {
        cbRead = cbRemaining;
    }

    if (pcontext->pblck->FReadRgb(pvBufferOut, cbRead, pcontext->ib, fFalse))
    {
        pcontext->ib += cbRead;
    }
    else
    {
        cbRead = 0;
        result = MA_IO_ERROR;
    }

    *pcbBytesRead = cbRead;
    return result;
}

/***************************************************************************
    Seek callback for ma_decoder that reads from a BLCK
***************************************************************************/
static ma_result BlockSeek(ma_decoder *pdecoder, ma_int64 ib, ma_seek_origin origin)
{
    Assert(pdecoder != pvNil, "no decoder");

    BLCKReadContext *pcontext = (BLCKReadContext *)pdecoder->pUserData;
    Assert(pcontext != pvNil, "no context");
    AssertPo(pcontext->pblck, 0);
    int32_t cb = pcontext->pblck->Cb();

    switch (origin)
    {
    case ma_seek_origin_start:
        break;
    case ma_seek_origin_current:
        ib += pcontext->ib;
        break;
    case ma_seek_origin_end:
        ib = cb - ib;
        break;
    default:
        Bug("invalid ma_seek_origin");
        break;
    }

    AssertIn(ib, 0, cb + 1);
    if (ib < 0)
        ib = 0;
    if (ib > cb)
        ib = cb;
    pcontext->ib = ib;

    return MA_SUCCESS;
}

/***************************************************************************
    Sound completion callback
***************************************************************************/
void SoundEndProc(void *pUserData, ma_sound *pSound)
{
    Assert(pSound != pvNil, "no sound");

    MiniaudioSoundInstance *psndin = (MiniaudioSoundInstance *)pUserData;
    Assert(psndin != pvNil, "No sound instance");
    Assert(&psndin->sound == pSound, "Sound does not match sound instance");

    bool fIsLoop = psndin->cactPlay == klwMax;
    if (!fIsLoop)
    {
        psndin->cactPlay--;
    }
}

RTCLASS(MiniaudioDevice)

MiniaudioDevice::MiniaudioDevice()
{
}

PMiniaudioDevice MiniaudioDevice::PmadevNew()
{
    PMiniaudioDevice pmadev;

    if (pvNil == (pmadev = NewObj MiniaudioDevice))
        return pvNil;

    if (!pmadev->_FInit())
        ReleasePpo(&pmadev);

    AssertNilOrPo(pmadev, 0);
    return pmadev;
}

bool MiniaudioDevice::_FInit()
{
    AssertBaseThis(0);
    ma_result result;

    // Initialise miniaudio
    ma_engine_config config = ma_engine_config_init();

    result = ma_engine_init(&config, &_engine);
    AssertMaSuccess(result, "ma_engine_init failed");
    if (result != MA_SUCCESS)
    {
        return fFalse;
    }

    _fInitialised = fTrue;

    SetVlm(kvlmFull);

    AssertThis(0);
    return fTrue;
}

MiniaudioDevice::~MiniaudioDevice()
{
    if (_fInitialised)
    {
        ma_engine_stop(&_engine);

        // Free all sounds
        for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
        {
            _rgsndin[isndin].cactPlay = 0;
        }
        Flush();

        ma_engine_uninit(&_engine);
        _fInitialised = fFalse;
    }
}

void MiniaudioDevice::Lock()
{
    _mutx.Enter();
}

void MiniaudioDevice::Unlock()
{
    _mutx.Leave();
}

bool MiniaudioDevice::FDebounce(int32_t tsStart)
{
    int32_t dtsStart = TsCurrentSystem() - tsStart;
    return (dtsStart > kdtsDebounce);
}

bool MiniaudioDevice::FLoadSoundFromBlock(PBLCK pblck, BLCKReadContext *preadctx, ma_decoder *pdecoder,
                                          ma_sound *psound)
{
    AssertThis(0);
    AssertPo(pblck, 0);
    Assert(preadctx != pvNil, "nil read context");
    Assert(pdecoder != pvNil, "nil decoder");

    ma_result result;

    // Initialise block reader context structure
    preadctx->pblck = pblck;
    preadctx->ib = 0;

    // Initialise the decoder.
    // The decoder reads the sound data from a block.
    result = ma_decoder_init(BlockRead, BlockSeek, preadctx, pvNil, pdecoder);
    AssertMaSuccess(result, "ma_decoder_init failed");
    if (result == MA_SUCCESS)
    {
        // Initialise the sound that reads from the decoder
        result = ma_sound_init_from_data_source(&_engine, pdecoder, 0, pvNil, psound);
        AssertMaSuccess(result, "ma_sound_init_from_data_source failed");

        if (MA_SUCCESS != result)
        {
            (void)ma_decoder_uninit(pdecoder);
        }
    }

    return (result == MA_SUCCESS);
}

bool MiniaudioDevice::FActive(void)
{
    AssertThis(0);
    return (_cactSuspend == 0);
}

void MiniaudioDevice::Activate(bool fActive)
{
    AssertThis(0);
    ma_result result;

    if (fActive)
    {
        if (_cactSuspend > 0)
        {
            _cactSuspend--;
        }
    }
    else
    {
        _cactSuspend++;
    }
    Assert(_cactSuspend >= 0, "negative suspend count");

    if (_cactSuspend == 0)
    {
        result = ma_engine_start(&_engine);
        AssertMaSuccess(result, "ma_engine_start failed");
    }
    else if (_cactSuspend == 1)
    {
        result = ma_engine_stop(&_engine);
        AssertMaSuccess(result, "ma_engine_stop failed");
    }
}

void MiniaudioDevice::Suspend(bool fSuspend)
{
    AssertThis(0);
    return Activate(!fSuspend);
}

MiniaudioSoundInstance *MiniaudioDevice::PsndinFromSii(int32_t sii, int32_t *pisndin)
{
    AssertThis(0);

    MiniaudioSoundInstance *psndin = pvNil;

    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        if (_rgsndin[isndin].sii == sii)
        {
            if (pvNil != pisndin)
                *pisndin = isndin;

            psndin = _rgsndin + isndin;
            break;
        }
    }

    return psndin;
}

void MiniaudioDevice::SetVlm(int32_t vlm)
{
    AssertThis(0);

    if (_vlm != vlm)
    {
        _vlm = vlm;
        ma_result result = ma_engine_set_volume(&_engine, ScaleVlm(vlm));
        AssertMaSuccess(result, "ma_engine_set_volume failed");
    }
}

int32_t MiniaudioDevice::VlmCur(void)
{
    AssertThis(0);
    return _vlm;
}

int32_t MiniaudioDevice::SiiPlay(PRCA prca, CTG ctg, CNO cno, int32_t sqn, int32_t vlm, int32_t cactPlay,
                                 uint32_t dtsStart, int32_t spr, int32_t scl)
{
    AssertThis(0);

    PMiniaudioCachedSound pmacs = pvNil;
    MiniaudioSoundInstance sndin;
    MiniaudioSoundInstance *psndin = pvNil;
    ma_result result = MA_SUCCESS;
    ma_sound *pmasound = pvNil;
    int32_t isndin;

    ClearPb(&sndin, SIZEOF(sndin));
    sndin.cactPlay = cactPlay;
    sndin.dtsStart = dtsStart;
    sndin.scl = scl;
    sndin.spr = spr;
    sndin.vlm = vlm;
    sndin.sqn = sqn;

    Lock();

    // Allocate a channel
    for (int32_t cact = 0; cact < CvFromRgv(_rgsndin); cact++)
    {
        isndin = _csndinCur;
        _csndinCur = (_csndinCur + 1) % CvFromRgv(_rgsndin);

        if (_rgsndin[isndin].sii == 0)
        {
            psndin = _rgsndin + isndin;
            break;
        }
    }

    if (psndin == pvNil)
    {
        Bug("No more channels!");
        Unlock();
        return 0;
    }

    // Load the sound data from the resource cache
    pmacs = (PMiniaudioCachedSound)prca->PbacoFetch(ctg, cno, &MiniaudioCachedSound::FReadMiniaudioCachedSound);
    if (pmacs == pvNil)
    {
        Unlock();
        return 0;
    }

    Assert(pmacs->FIs(kclsMiniaudioCachedSound), "That's not a Miniaudio sound!");

    sndin.sii = _SiiAlloc();
    sndin.tsStart = TsCurrentSystem();
    sndin.pbaco = pmacs;
    sndin.pbaco->AddRef();

    // Add the instance to the list
    *psndin = sndin;

    if (FLoadSoundFromBlock(pmacs->Pblck(), &psndin->readctx, &psndin->decoder, &psndin->sound))
    {
        psndin->fLoaded = fTrue;
        pmasound = &psndin->sound;

        result = ma_sound_set_end_callback(pmasound, SoundEndProc, psndin);
        AssertMaSuccess(result, "ma_sound_set_end_callback failed");

        ma_sound_set_volume(pmasound, ScaleVlm(sndin.vlm));
        if (sndin.dtsStart == 0)
        {
            result = ma_sound_seek_to_pcm_frame(pmasound, 0);
            AssertMaSuccess(result, "ma_sound_seek_to_pcm_frame failed");
        }
        else
        {
            result = ma_sound_seek_to_second(pmasound, sndin.dtsStart / 1000.0F);
            AssertMaSuccess(result, "ma_sound_seek_to_second failed");
        }

        // FUTURE: Support repeating a number of times to match existing behaviour
        if (sndin.cactPlay != 1)
        {
            ma_sound_set_looping(pmasound, fTrue);
        }

        result = ma_sound_start(pmasound);
        AssertMaSuccess(result, "ma_sound_start failed");
    }
    else
    {
        // Failed to load the sound
        // Set the sound's cactPlay to 0 so it is freed in Flush()
        psndin->cactPlay = 0;
    }

    ReleasePpo(&pmacs);
    Unlock();
    return sndin.sii;
}

void MiniaudioDevice::Stop(int32_t sii)
{
    AssertThis(0);

    MiniaudioSoundInstance *psndin;
    int32_t isndin;

    Lock();

    psndin = PsndinFromSii(sii, &isndin);
    if (pvNil != psndin)
    {
        if (FDebounce(_rgsndin[isndin].tsStart))
        {
            ma_sound *pmasound = &psndin->sound;
            Assert(pmasound != pvNil, "nil ma_sound");
            ma_result result = ma_sound_stop(pmasound);
            AssertMaSuccess(result, "ma_sound_stop failed");
            psndin->cactPlay = 0;
        }
    }

    Unlock();
}

void MiniaudioDevice::StopAll(int32_t sqn, int32_t scl)
{
    AssertThis(0);

    Lock();

    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        if (_rgsndin[isndin].sii == 0)
        {
            continue;
        }

        if ((sqn == sqnNil || _rgsndin[isndin].sqn == sqn) && (scl == sclNil || _rgsndin[isndin].scl == scl))
        {
            if (FDebounce(_rgsndin[isndin].tsStart))
            {
                ma_sound *pmasound = &_rgsndin[isndin].sound;
                Assert(pmasound != pvNil, "nil ma_sound");
                ma_result result = ma_sound_stop(pmasound);
                AssertMaSuccess(result, "ma_sound_stop failed");
                _rgsndin[isndin].cactPlay = 0;
            }
        }
    }

    Unlock();
}

void MiniaudioDevice::Pause(int32_t sii)
{
    AssertThis(0);

    MiniaudioSoundInstance *psndin;
    int32_t isndin;

    Lock();

    psndin = PsndinFromSii(sii, &isndin);
    if (pvNil != psndin)
    {
        if (FDebounce(psndin->tsStart))
        {
            ma_sound *pmasound = &psndin->sound;
            Assert(pmasound != pvNil, "nil ma_sound");
            ma_result result = ma_sound_stop(pmasound);
            AssertMaSuccess(result, "ma_sound_stop failed");
        }
    }

    Unlock();
}

void MiniaudioDevice::PauseAll(int32_t sqn, int32_t scl)
{
    AssertThis(0);

    Lock();

    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        if (_rgsndin[isndin].sii == 0)
        {
            continue;
        }

        if ((sqn == sqnNil || _rgsndin[isndin].sqn == sqn) && (scl == sclNil || _rgsndin[isndin].scl == scl))
        {
            if (FDebounce(_rgsndin[isndin].tsStart))
            {
                ma_sound *pmasound = &_rgsndin[isndin].sound;
                Assert(pmasound != pvNil, "nil ma_sound");
                ma_result result = ma_sound_stop(pmasound);
                AssertMaSuccess(result, "ma_sound_stop failed");
            }
        }
    }

    Unlock();
}

void MiniaudioDevice::Resume(int32_t sii)
{
    AssertThis(0);

    MiniaudioSoundInstance *psndin;
    int32_t isndin;

    Lock();

    psndin = PsndinFromSii(sii, &isndin);
    if (pvNil != psndin)
    {
        ma_sound *pmasound = &psndin->sound;
        Assert(pmasound != pvNil, "nil ma_sound");
        ma_result result = ma_sound_start(pmasound);
        AssertMaSuccess(result, "ma_sound_start failed");
    }

    Unlock();
}

void MiniaudioDevice::ResumeAll(int32_t sqn, int32_t scl)
{
    AssertThis(0);

    Lock();

    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        if (_rgsndin[isndin].sii == 0)
        {
            continue;
        }

        if ((sqn == sqnNil || _rgsndin[isndin].sqn == sqn) && (scl == sclNil || _rgsndin[isndin].scl == scl))
        {
            ma_sound *pmasound = &_rgsndin[isndin].sound;
            Assert(pmasound != pvNil, "nil ma_sound");

            ma_result result = ma_sound_start(pmasound);
            AssertMaSuccess(result, "ma_sound_start failed");
        }
    }

    Unlock();
}

bool MiniaudioDevice::FPlaying(int32_t sii)
{
    AssertThis(0);

    bool fPlaying = fFalse;
    MiniaudioSoundInstance *psndin;
    int32_t isndin;

    Lock();

    psndin = PsndinFromSii(sii, &isndin);
    if (pvNil != psndin)
    {
        ma_sound *pmasound = &psndin->sound;
        Assert(pmasound != pvNil, "nil ma_sound");
        if (pvNil != pmasound)
        {
            fPlaying = ma_sound_is_playing(pmasound);
        }
    }

    Unlock();

    return fPlaying;
}

bool MiniaudioDevice::FPlayingAll(int32_t sqn, int32_t scl)
{
    AssertThis(0);

    bool fResult = fFalse;

    Lock();

    // Returns fTrue if any sound is playing
    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        if (_rgsndin[isndin].sii == 0 || !_rgsndin[isndin].fLoaded)
        {
            continue;
        }

        if ((sqn == sqnNil || _rgsndin[isndin].sqn == sqn) && (scl == sclNil || _rgsndin[isndin].scl == scl))
        {
            if (ma_sound_is_playing(&_rgsndin[isndin].sound))
            {
                fResult = fTrue;
                break;
            }
        }
    }

    Unlock();
    return fResult;
}

void MiniaudioDevice::Flush(void)
{
    Lock();
    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        MiniaudioSoundInstance *psndin = &_rgsndin[isndin];
        if (psndin->fLoaded && psndin->cactPlay == 0)
        {
            ma_sound_uninit(&psndin->sound);
            ma_result result = ma_decoder_uninit(&psndin->decoder);
            AssertMaSuccess(result, "ma_decoder_uninit failed");
            ReleasePpo(&psndin->pbaco);
            ClearPb(psndin, SIZEOF(*psndin));
        }
    }
    Unlock();
}

#ifdef DEBUG
void MiniaudioDevice::AssertValid(uint32_t grf)
{
    MiniaudioDevice_PAR::AssertValid(0);
}

void MiniaudioDevice::MarkMem()
{
    MiniaudioDevice_PAR::MarkMem();

    for (int32_t isndin = 0; isndin < CvFromRgv(_rgsndin); isndin++)
    {
        MarkMemObj(_rgsndin[isndin].pbaco);
    }
}
#endif // DEBUG

float ScaleVlm(int32_t vlm)
{
    // The volume control in the studio can be set to a maximum value of 2*kvlmFull
    const int32_t kvlmMac = (kvlmFull * 2) + 1;
    AssertIn(vlm, 0, kvlmMac);
    return ((float)vlm) / (float)kvlmFull;
}