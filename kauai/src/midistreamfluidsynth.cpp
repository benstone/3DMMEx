/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK, Mark Cave-Ayland
    Project: Kauai
    Copyright (c) Microsoft Corporation

    MIDI stream interface: FluidSynth

***************************************************************************/
#include "frame.h"
#include "mdev2pri.h"
#include "midistreamfluidsynth.h"

#include <chrono>

ASSERTNAME

RTCLASS(FMS)

const int32_t kdtsMinSlip = kdtsSecond / 30;

#define FMS_LUTHREAD_SLEEP_DELAY 5
#define FMS_LUTHREAD_FRAMES_PENDING 8192

/***************************************************************************
    Constructor for our own midi stream api implementation.
***************************************************************************/
FMS::FMS(PFNMIDI pfn, uintptr_t luUser)
{
    _pfnCall = pfn;
    _luUser = luUser;
    _vlmBase = kvlmFull;
}

/***************************************************************************
    Destructor for our midi stream.
***************************************************************************/
FMS::~FMS(void)
{
    int is;

    if (_hth.joinable())
    {
        _fDone = fTrue;
        _hevt.Set();
        _hth.join();
    }

    _mutx.Enter();

    if (_hthr.joinable())
    {
        _hthr.join();
    }

    Assert(_fOpen == fFalse, "Still open");
    Assert(_pglmsb->IvMac() == 0, "Still have some buffers");
    _pastream->FStop();
    ReleasePpo(&_pastream);
    ReleasePpo(&_pglmsb);

    if (_flsynth != pvNil)
        delete_fluid_synth(_flsynth);

    if (_flset != pvNil)
        delete_fluid_settings(_flset);

    _fOpen = fFalse;

    _mutx.Leave();
}

/***************************************************************************
    Create a new FMS.
***************************************************************************/
PFMS FMS::PfmsNew(PFNMIDI pfn, uintptr_t luUser)
{
    PFMS poms;

    if (pvNil == (poms = NewObj FMS(pfn, luUser)))
        return pvNil;

    if (!poms->_FInit())
        ReleasePpo(&poms);

    return poms;
}

/***************************************************************************
    Initialize the FMS.
***************************************************************************/
bool FMS::_FInit(void)
{
    ma_device *pdevice = MiniaudioManager::Pmanager()->Pengine()->pDevice;
    char buf[256];
    int id, ret;

    AssertBaseThis(0);

    if (pvNil == (_pglmsb = GL::PglNew(SIZEOF(MSB))))
        return fFalse;
    _pglmsb->SetMinGrow(1);

    _mutx.Enter();

    _flset = new_fluid_settings();
    if (_flset == pvNil)
    {
        Bug("failed to create fluidsynth settings");
        goto LFail;
    }
    ret = fluid_settings_setnum(_flset, "synth.sample-rate", pdevice->sampleRate);
    if (ret == FLUID_FAILED)
    {
        Bug("failed to set synth.sample-rate");
        goto LFail;
    }

    _flsynth = new_fluid_synth(_flset);
    if (_flsynth == pvNil)
    {
        Bug("failed to create fluidsynth synth");
        goto LFail;
    }

    ret = fluid_settings_copystr(_flset, "synth.default-soundfont", buf, sizeof(buf));
    if (ret == FLUID_FAILED)
    {
        Bug("failed to get synth.default-soundfont");
        goto LFail;
    }

    ret = fluid_synth_sfload(_flsynth, buf, true);
    if (ret == FLUID_FAILED)
    {
        FNI fniExe;
        STN stnFileName = PszLit("soundfont.sf3");
        STN stnSoundFontPath;

        // Try app directory
        fniExe.FGetExe();
        fniExe.FSetLeaf(&stnFileName);
        fniExe.GetStnPath(&stnSoundFontPath);

        ret = fluid_synth_sfload(_flsynth, stnSoundFontPath.Psz(), true);
        if (ret == FLUID_FAILED)
        {
            Bug("failed to load soundfont");
            goto LFail;
        }
    }

    ret = fluid_settings_getint(_flset, "audio.period-size", &_flframecount);
    if (ret == FLUID_FAILED)
    {
        Bug("failed to get audio.period-size");
        goto LFail;
    }

    // Check the output format is correct
    if (pdevice->playback.format != ma_format_f32)
    {
        Bug("expected f32 format");
        goto LFail;
    }

    if (pdevice->playback.channels != 2)
    {
        Bug("expected stereo");
        goto LFail;
    }

    // Create the stream and start playing it
    _pastream = MiniaudioStream::PastreamNew(MiniaudioManager::Pmanager());
    AssertPo(_pastream, 0);
    _hth = std::thread([this] { return this->_LuThread(); });
    _hthr = std::thread([this] { return this->_LuRenderThread(); });
    AssertDo(_pastream->FPlay(), "Could not play");

    _mutx.Leave();

    return fTrue;

LFail:
    if (_flsynth != pvNil)
        delete_fluid_synth(_flsynth);

    if (_flset != pvNil)
        delete_fluid_settings(_flset);

    _mutx.Leave();

    return fFalse;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of a FMS.
***************************************************************************/
void FMS::AssertValid(uint32_t grf)
{
    FMS_PAR::AssertValid(0);

    _mutx.Enter();
    AssertPo(_pglmsb, 0);
    _mutx.Leave();
}

/***************************************************************************
    Mark memory for the FMS.
***************************************************************************/
void FMS::MarkMem(void)
{
    FMS_PAR::MarkMem();

    _mutx.Enter();
    MarkMemObj(_pglmsb);
    MarkMemObj(_pastream);
    _mutx.Leave();
}
#endif // DEBUG

/***************************************************************************
    Open the stream.
***************************************************************************/
bool FMS::_FOpen(void)
{
    AssertThis(0);

    _mutx.Enter();
    if (_fOpen == fTrue)
        goto LDone;

    _fChanged = _fStop = fFalse;
    _fOpen = fTrue;

    // set our volume level
    SetVlm(_vlmBase);

LDone:
    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Close the stream.
***************************************************************************/
bool FMS::_FClose(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (_fOpen == fFalse)
    {
        _mutx.Leave();
        return fTrue;
    }

    if (_pglmsb->IvMac() > 0)
    {
        Bug("closing a stream that still has buffers!");
        _mutx.Leave();
        return fFalse;
    }

    // reset the device
    _Reset();

    _fOpen = fFalse;

    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Reset the midi device.
***************************************************************************/
void FMS::_Reset(void)
{
    Assert(_fOpen == fTrue, 0);

    fluid_synth_system_reset(_flsynth);
}

/***************************************************************************
    Set the volume for the midi stream output device.
***************************************************************************/
void FMS::SetVlm(int32_t vlm)
{
    AssertThis(0);

    if (vlm != _vlmBase)
    {
        _vlmBase = vlm;
        if (_fOpen == fTrue)
            _pastream->SetVlm(vlm);
    }
}

/***************************************************************************
    Get the current volume.
***************************************************************************/
int32_t FMS::VlmCur(void)
{
    AssertThis(0);

    return _vlmBase;
}

/***************************************************************************
    Return whether the midi stream output device is active.
***************************************************************************/
bool FMS::FActive(void)
{
    return (_fOpen == fTrue);
}

/***************************************************************************
    Activate or deactivate the Midi stream output object.
***************************************************************************/
bool FMS::FActivate(bool fActivate)
{
    AssertThis(0);

    return fActivate ? _FOpen() : _FClose();
}

/***************************************************************************
    Queue a buffer to the midi stream.
***************************************************************************/
bool FMS::FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData)
{
    AssertThis(0);
    AssertPvCb(pvData, cb);
    AssertIn(ibStart, 0, cb);
    Assert(cb % SIZEOF(MEV) == 0, "bad cb");
    Assert(ibStart % SIZEOF(MEV) == 0, "bad cb");

    MSB msb;

    _mutx.Enter();

    if (_fOpen == fFalse)
        goto LFail;

    msb.pvData = pvData;
    msb.cb = cb;
    msb.ibStart = ibStart;
    msb.cactPlay = cactPlay;
    msb.luData = luData;

    if (!_pglmsb->FAdd(&msb))
    {
    LFail:
        _mutx.Leave();
        return fFalse;
    }

    if (1 == _pglmsb->IvMac())
    {
        // Start the buffer
        _fChanged = fTrue;
        _hevt.Set();
    }

    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Stop the stream and release all buffers. The buffer notifies are
    asynchronous.
***************************************************************************/
void FMS::StopPlaying(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (_fOpen == fTrue)
    {
        _fStop = fTrue;
        _hevt.Set();
        _fChanged = fTrue;
    }

    _mutx.Leave();
}

/***************************************************************************
    AT: The midi stream playback thread.
***************************************************************************/
uint32_t FMS::_LuThread(void)
{
    AssertThis(0);
    MSB msb;
    bool fChanged; // whether the event went off
    uint32_t tsCur;
    const int32_t klwInfinite = klwMax;
    int32_t dtsWait = klwInfinite;

    for (;;)
    {
        fChanged = (dtsWait > 0 && _hevt.Wait(dtsWait == klwInfinite ? KSIGNAL_INFINITE : dtsWait));

        if (_fDone)
            return 0;

        _mutx.Enter();
        if (_fChanged && !fChanged)
        {
            // the event went off before we got the mutx.
            dtsWait = klwInfinite;
            goto LLoop;
        }

        _fChanged = fFalse;
        if (!fChanged)
        {
            // play the event
            if (_pmev < _pmevLim)
            {
                if (MEVT_SHORTMSG == (_pmev->dwEvent >> 24))
                {
                    switch (_pmev->dwEvent & 0xf0)
                    {
                    case 0x80: /* Note off */
                        fluid_synth_noteoff(_flsynth, _pmev->dwEvent & 0xf, (_pmev->dwEvent & 0x7f00) >> 8);
                        break;

                    case 0x90: /* Note on */
                        fluid_synth_noteon(_flsynth, _pmev->dwEvent & 0xf, (_pmev->dwEvent & 0x7f00) >> 8,
                                           (_pmev->dwEvent & 0x7f0000) >> 16);
                        break;

                    case 0xb0: /* Control change */
                        fluid_synth_cc(_flsynth, _pmev->dwEvent & 0xf, (_pmev->dwEvent & 0x7f00) >> 8,
                                       (_pmev->dwEvent & 0x7f0000) >> 16);
                        break;

                    case 0xc0: /* Program change */
                        fluid_synth_program_change(_flsynth, _pmev->dwEvent & 0xf, (_pmev->dwEvent & 0x7f00) >> 8);
                        break;

                    case 0xd0: /* Channel pressure */
                        fluid_synth_channel_pressure(_flsynth, _pmev->dwEvent & 0xf, (_pmev->dwEvent & 0x7f00) >> 8);
                        break;

                    case 0xe0: /* Pitch wheel */
                        fluid_synth_pitch_bend(_flsynth, _pmev->dwEvent & 0xf,
                                               ((_pmev->dwEvent & 0x7f00) >> 8) | ((_pmev->dwEvent & 0x7f0000) >> 9));
                        break;
                    }
                }

                _pmev++;
                if (_pmev >= _pmevLim)
                {
                    dtsWait = 0;
                }
                else
                {
                    uint32_t tsNew = TsCurrentSystem();

                    tsCur += _pmev->dwDeltaTime;
                    dtsWait = tsCur - tsNew;
                    if (dtsWait < -kdtsMinSlip)
                    {
                        tsCur = tsNew;
                        dtsWait = 0;
                    }
                }
                goto LLoop;
            }

            // ran out of events in the current buffer - see if we should
            // repeat it
            _pglmsb->Get(0, &msb);
            if (msb.cactPlay == 1)
            {
                _imsbCur = 1;
                _ReleaseBuffers();
            }
            else
            {
                // repeat the current buffer
                if (msb.cactPlay > 0)
                    msb.cactPlay--;
                msb.ibStart = 0;
                _pglmsb->Put(0, &msb);
            }
        }
        else if (_fStop)
        {
            // release all buffers
            _fStop = fFalse;
            _imsbCur = _pglmsb->IvMac();
            _ReleaseBuffers();
        }

        if (0 == _pglmsb->IvMac())
        {
            // no buffers to play
            dtsWait = klwInfinite;
        }
        else
        {
            // start playing the new buffers
            _pglmsb->Get(0, &msb);
            _pmev = (PMEV)PvAddBv(msb.pvData, msb.ibStart);
            _pmevLim = (PMEV)PvAddBv(msb.pvData, msb.cb);
            if (_pmev >= _pmevLim)
            {
                dtsWait = 0;
            }
            else
            {
                dtsWait = _pmev->dwDeltaTime;
                tsCur = TsCurrentSystem() + dtsWait;
            }
        }
    LLoop:
        _mutx.Leave();
    }
}

/***************************************************************************
    AT: The midi stream playback thread.
***************************************************************************/
uint32_t FMS::_LuRenderThread(void)
{
    float *flFrame = pvNil;

    if (!FAllocPv((void **)&flFrame, SIZEOF(float) * _flframecount * 2, fmemClear, mprNormal))
        goto LFail;

    for (;;)
    {
        while (_pastream->GetPendingFrames() < FMS_LUTHREAD_FRAMES_PENDING)
        {
            if (_fDone)
                return 0;

            if (!_fStop)
            {
                fluid_synth_write_float(_flsynth, _flframecount, flFrame, 0, 2, flFrame, 1, 2);
                AssertDo(_pastream->FWriteAudio(flFrame, _flframecount), "could not write audio");
            }
        }

        if (_fDone)
        {
            _hevt.Set();
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(FMS_LUTHREAD_SLEEP_DELAY));
    }

LFail:
    FreePpv((void **)flFrame);

    return 0;
}

/***************************************************************************
    Release all buffers up to _imsbCur. Assumes that we have the mutx
    checked out exactly once.
***************************************************************************/
void FMS::_ReleaseBuffers(void)
{
    MSB msb;

    if (_imsbCur >= _pglmsb->IvMac() && _fOpen == fTrue)
        _Reset();

    while (_imsbCur > 0)
    {
        _pglmsb->Get(0, &msb);
        _pglmsb->Delete(0);
        _imsbCur--;

        _mutx.Leave();

        // call the notify proc
        (*_pfnCall)(_luUser, msb.pvData, msb.luData);

        _mutx.Enter();
    }
}
