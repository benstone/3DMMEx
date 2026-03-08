/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Copyright (c) Microsoft Corporation

    MIDI stream interface: Windows 95

***************************************************************************/
#include "frame.h"
#include "mdev2pri.h"
#include "midistreamwin95.h"

ASSERTNAME

RTCLASS(WMS)

const int32_t kcbMaxWmsBuffer = 0x0000FFFF / SIZEOF(MEV) * SIZEOF(MEV);

/***************************************************************************
    Constructor for the Win95 Midi stream class.
***************************************************************************/
WMS::WMS(PFNMIDI pfn, uintptr_t luUser) : MISI(pfn, luUser)
{
}

/***************************************************************************
    Destructor for the Win95 Midi stream class.
***************************************************************************/
WMS::~WMS(void)
{
    if (hNil != _hth)
    {
        // tell the thread to end and wait for it to finish
        _fDone = fTrue;
        SetEvent(_hevt);
        WaitForSingleObject(_hth, INFINITE);
    }

    if (hNil != _hevt)
        CloseHandle(_hevt);

    if (pvNil != _pglpmsir)
    {
        Assert(0 == _pglpmsir->IvMac(), "WMS still has some active buffers");
        ReleasePpo(&_pglpmsir);
    }
    if (hNil != _hlib)
    {
        FreeLibrary(_hlib);
        _hlib = hNil;
    }
}

/***************************************************************************
    Create a new WMS.
***************************************************************************/
PWMS WMS::PwmsNew(PFNMIDI pfn, uintptr_t luUser)
{
    PWMS pwms;

    if (pvNil == (pwms = NewObj WMS(pfn, luUser)))
        return pvNil;

    if (!pwms->_FInit())
        ReleasePpo(&pwms);

    return pwms;
}

/***************************************************************************
    Initialize the WMS: get the addresses of the stream API.
***************************************************************************/
bool WMS::_FInit(void)
{
    OSVERSIONINFO osv;
    DWORD luThread;

    // Make sure we're on Win95 and not NT, since the API exists on NT 3.51
    // but it fails.
    osv.dwOSVersionInfoSize = SIZEOF(osv);
    if (!GetVersionEx(&osv))
        return fFalse;

// Old header files don't have this defined!
#ifndef VER_PLATFORM_WIN32_WINDOWS
#define VER_PLATFORM_WIN32_WINDOWS 1
#endif //! VER_PLATFORM_WIN32_WINDOWS

    if (VER_PLATFORM_WIN32_WINDOWS != osv.dwPlatformId)
    {
        // don't bother trying - NT's scheduler works fine anyway.
        return fFalse;
    }

    if (hNil == (_hlib = LoadLibrary(PszLit("WINMM.DLL"))))
        return fFalse;

#define _Get(n)                                                                                                        \
    if (pvNil == (*(void **)&_pfn##n = (void *)GetProcAddress(_hlib, "midiStream" #n)))                                \
    {                                                                                                                  \
        return fFalse;                                                                                                 \
    }

    _Get(Open);
    _Get(Close);
    _Get(Property);
    _Get(Position);
    _Get(Out);
    _Get(Pause);
    _Get(Restart);
    _Get(Stop);

#undef _Get

    if (pvNil == (_pglpmsir = GL::PglNew(SIZEOF(PMSIR))))
        return fFalse;
    _pglpmsir->SetMinGrow(1);

    if (hNil == (_hevt = CreateEvent(pvNil, fFalse, fFalse, pvNil)))
        return fFalse;

    // create the thread
    if (hNil == (_hth = CreateThread(pvNil, 1024, WMS::_ThreadProc, this, 0, &luThread)))
    {
        return fFalse;
    }

    AssertThis(0);
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of a WMS.
***************************************************************************/
void WMS::AssertValid(uint32_t grf)
{
    WMS_PAR::AssertValid(0);
    Assert(hNil != _hlib, 0);
    int32_t cpmsir;

    _mutx.Enter();
    Assert(hNil != _hevt, "nil event");
    Assert(hNil != _hth, "nil thread");
    AssertPo(_pglpmsir, 0);
    cpmsir = _pglpmsir->IvMac();
    Assert(_cmhOut >= 0, "negative _cmhOut");
    AssertIn(_ipmsirCur, 0, cpmsir + 1);
    _mutx.Leave();
}

/***************************************************************************
    Mark memory for the WMS.
***************************************************************************/
void WMS::MarkMem(void)
{
    AssertValid(0);
    PMSIR pmsir;
    int32_t ipmsir;

    WMS_PAR::MarkMem();

    _mutx.Enter();
    for (ipmsir = _pglpmsir->IvMac(); ipmsir-- > 0;)
    {
        _pglpmsir->Get(ipmsir, &pmsir);
        AssertVarMem(pmsir);
        MarkPv(pmsir);
    }
    MarkMemObj(_pglpmsir);
    _mutx.Leave();
}
#endif // DEBUG

/***************************************************************************
    Opens the midi stream and sets the time division to 1000 ticks per
    quarter note. It is assumed that the midi data has a tempo record
    indicating 1 quarter note per second (1000000 microseconds per quarter).
    The end result is that ticks are milliseconds.
***************************************************************************/
bool WMS::_FOpen(void)
{
    AssertThis(0);

    // MIDIPROPTIMEDIV struct
    struct MT
    {
        DWORD cbStruct;
        DWORD dwTimeDiv;
    };

    MT mt;
    UINT uT = MIDI_MAPPER;

    _mutx.Enter();

    if (hNil != _hms)
        goto LDone;

    if (MMSYSERR_NOERROR != (*_pfnOpen)(&_hms, &uT, 1, (uintptr_t)_MidiProc, (uintptr_t)this, CALLBACK_FUNCTION))
    {
        goto LFail;
    }

    // We set the time division to 1000 ticks per beat, so clients can
    // use 1 beat per second and just use milliseconds for timing.
    // We also un-pause the stream.
    mt.cbStruct = SIZEOF(mt);
    mt.dwTimeDiv = 1000;

    if (MMSYSERR_NOERROR != (*_pfnProperty)(_hms, (uint8_t *)&mt, MIDIPROP_SET | MIDIPROP_TIMEDIV))
    {
        (*_pfnClose)(_hms);
    LFail:
        _hms = hNil;
        _mutx.Leave();
        return fFalse;
    }

    // we know there are no buffers submitted
    AssertVar(_cmhOut == 0, "why is _cmhOut non-zero?", &_cmhOut);
    _cmhOut = 0;

    // get the system volume level
    _GetSysVol();

    // set our volume level
    _SetSysVlm();

LDone:
    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Close the midi stream.
***************************************************************************/
bool WMS::_FClose(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (hNil == _hms)
    {
        _mutx.Leave();
        return fTrue;
    }

    if (0 < _cmhOut)
    {
        BugVar("closing a stream that still has buffers!", &_cmhOut);
        _mutx.Leave();
        return fFalse;
    }

    // reset the device
    _Reset();

    // restore the volume level
    _SetSysVol(_luVolSys);

    // free the device
    (*_pfnClose)(_hms);
    _hms = hNil;

    _mutx.Leave();

    return fTrue;
}

#ifdef STREAM_BUG
/***************************************************************************
    Just return the value of our flag, not (hNil != _hms).
***************************************************************************/
bool WMS::FActive(void)
{
    return _fActive;
}

/***************************************************************************
    Need to set _fActive as well.
***************************************************************************/
bool WMS::FActivate(bool fActivate)
{
    bool fRet;

    fRet = WMS_PAR::FActivate(fActivate);
    if (fRet)
        _fActive = FPure(fActivate);
    return fRet;
}
#endif // STREAM_BUG

/***************************************************************************
    Reset the midi stream so it's ready to accept new input. Assumes we
    already have the mutx.
***************************************************************************/
void WMS::_ResetStream(void)
{
    if (!FActive())
        return;

#ifdef STREAM_BUG
    if (hNil == _hms)
        _FOpen();
    else
    {
        (*_pfnStop)(_hms);
        _FClose();
        _FOpen();
    }
#else  //! STREAM_BUG
    (*_pfnStop)(_hms);
    _Reset();
#endif //! STREAM_BUG
}

/***************************************************************************
    This submits a buffer and restarts the midi stream. If the data is
    bigger than 64K, this (in conjunction with _Notify) deals with it.
***************************************************************************/
bool WMS::FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData)
{
    AssertThis(0);
    AssertPvCb(pvData, cb);
    AssertIn(ibStart, 0, cb);
    Assert(cb % SIZEOF(MEV) == 0, "bad cb");
    Assert(ibStart % SIZEOF(MEV) == 0, "bad cb");

    int32_t ipmsir;
    PMSIR pmsir = pvNil;
    bool fRet = fTrue;

    _mutx.Enter();

    if (hNil == _hms)
        goto LFail;

    if (!FAllocPv((void **)&pmsir, SIZEOF(MSIR), fmemClear, mprNormal))
        goto LFail;

    pmsir->pvData = pvData;
    pmsir->cb = cb;
    pmsir->cactPlay = cactPlay;
    pmsir->luData = luData;
    pmsir->ibNext = ibStart;

    if (_hms == hNil || !_pglpmsir->FAdd(&pmsir, &ipmsir))
        goto LFail;

    if (0 == _CmhSubmitBuffers() && ipmsir == 0)
    {
        // submitting the buffers failed
        _pglpmsir->Delete(0);
        _ipmsirCur = 0;
    LFail:
        FreePpv((void **)pmsir);
        fRet = fFalse;
    }

    _mutx.Leave();

    return fRet;
}

/***************************************************************************
    Submits buffers. Assumes the _mutx is already ours.
***************************************************************************/
int32_t WMS::_CmhSubmitBuffers(void)
{
    PMSIR pmsir;
    int32_t cbMh;
    PMH pmh;
    int32_t imh;
    int32_t cmh = 0;

    while (_ipmsirCur < _pglpmsir->IvMac())
    {
        _pglpmsir->Get(_ipmsirCur, &pmsir);
        if (pmsir->ibNext >= pmsir->cb)
        {
            // see if the sound should be repeated
            if (pmsir->cactPlay == 1)
            {
                _ipmsirCur++;
                continue;
            }
            pmsir->cactPlay--;
            pmsir->ibNext = 0;
        }

        // see if one of the buffers is free
        for (imh = 0;; imh++)
        {
            if (imh >= kcmhMsir)
            {
                // all buffers are busy
                Assert(_cmhOut >= kcmhMsir, 0);
                return cmh;
            }
            if (pmsir->rgibLim[imh] == 0)
                break;
        }

        // fill the buffer and submit it
        pmh = &pmsir->rgmh[imh];
        pmh->lpData = (byte *)PvAddBv(pmsir->pvData, pmsir->ibNext);
        cbMh = LwMin(pmsir->cb - pmsir->ibNext, kcbMaxWmsBuffer);
        pmh->dwBufferLength = cbMh;
        pmh->dwBytesRecorded = cbMh;
        pmh->dwUser = (uintptr_t)pmsir;
        pmsir->ibNext += cbMh;
        pmsir->rgibLim[imh] = pmsir->ibNext;

        if (_FSubmit(pmh))
            cmh++;
        else
        {
            // just play the previous buffers and forget about this one
            pmsir->ibNext = pmsir->cb;
            pmsir->rgibLim[imh] = 0;
            pmsir->cactPlay = 1;
            _ipmsirCur++;
        }
    }

    return cmh;
}

/***************************************************************************
    Prepare and submit the given buffer. Assumes the mutx is ours.
***************************************************************************/
bool WMS::_FSubmit(PMH pmh)
{
    bool fRestart = (0 == _cmhOut);

    if (hNil == _hms)
        return fFalse;

    // prepare and submit the buffer
    if (MMSYSERR_NOERROR != midiOutPrepareHeader(_hms, (PMHO)pmh, sizeof(*pmh)))
        return fFalse;

    if (MMSYSERR_NOERROR != (*_pfnOut)(_hms, (PMHO)pmh, SIZEOF(*pmh)))
    {
        midiOutUnprepareHeader(_hms, (PMHO)pmh, SIZEOF(*pmh));
        return fFalse;
    }
    _cmhOut++;

    if (fRestart)
        (*_pfnRestart)(_hms);

    return fTrue;
}

/***************************************************************************
    Stop the midi stream.
***************************************************************************/
void WMS::StopPlaying(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (hNil != _hms && _cmhOut > 0)
    {
        (*_pfnStop)(_hms);
        _ipmsirCur = _pglpmsir->IvMac();
    }

    _mutx.Leave();
}

/***************************************************************************
    Call back from the midi stream. If the number of active buffers returns
    to 0, this stops the midi stream. If the indicated sound is done,
    we notify the client.
***************************************************************************/
void __stdcall WMS::_MidiProc(HMS hms, UINT msg, DWORD_PTR luUser, DWORD_PTR lu1, DWORD_PTR lu2)
{
    PWMS pwms;
    PMH pmh;

    if (msg != MOM_DONE)
        return;

    pwms = (PWMS)luUser;
    AssertPo(pwms, 0);
    pmh = (PMH)lu1;
    AssertVarMem(pmh);
    pwms->_Notify(hms, pmh);
}

/***************************************************************************
    The this-based callback.

    The mmsys guys claim that it's illegal to call midiOutUnprepareHeader,
    midiStreamStop and midiOutReset. So we just signal another thread to
    do this work.
***************************************************************************/
void WMS::_Notify(HMS hms, PMH pmh)
{
    AssertThis(0);
    Assert(hNil != hms, 0);
    AssertVarMem(pmh);

    PMSIR pmsir;
    int32_t imh;

    _mutx.Enter();

    Assert(hms == _hms, "wrong hms");

    midiOutUnprepareHeader(hms, (PMHO)pmh, SIZEOF(*pmh));
    pmsir = (PMSIR)pmh->dwUser;
    AssertVarMem(pmsir);
    AssertPvCb(pmsir->pvData, pmsir->cb);

    for (imh = 0;; imh++)
    {
        if (imh >= kcmhMsir)
        {
            Bug("corrupt msir");
            _mutx.Leave();
            return;
        }

        if (pmh == &pmsir->rgmh[imh])
            break;
    }

    Assert(pmh->lpData == PvAddBv(pmsir->pvData, pmsir->rgibLim[imh] - pmh->dwBufferLength), "pmh->lpData is wrong");

    // mark this buffer free
    pmsir->rgibLim[imh] = 0;

    // fill and submit buffers
    _CmhSubmitBuffers();

    // update the submitted buffer count
    --_cmhOut;

    // wake up the auxillary thread to do callbacks and stop and reset
    // the device it there's nothing more to play
    SetEvent(_hevt);

    _mutx.Leave();
}

/***************************************************************************
    AT: Static method. Thread function for the WMS object. This thread
    just waits for the event to be triggered, indicating that we got
    a callback from the midiStream stuff and it's time to do our callbacks.
***************************************************************************/
DWORD __stdcall WMS::_ThreadProc(LPVOID pv)
{
    PWMS pwms = (PWMS)pv;

    AssertPo(pwms, 0);

    return pwms->_LuThread();
}

/***************************************************************************
    AT: This thread just sleeps until the next sound is due to expire, then
    wakes up and nukes any expired sounds.
***************************************************************************/
DWORD WMS::_LuThread(void)
{
    AssertThis(0);

    for (;;)
    {
        WaitForSingleObject(_hevt, INFINITE);

        if (_fDone)
            return 0;

        _mutx.Enter();

        if (hNil != _hms && 0 == _cmhOut)
            _ResetStream();

        _DoCallBacks();

        _mutx.Leave();
    }
}

/***************************************************************************
    Check for MSIRs that are done and do the callback on them and free them.
    Assumes the _mutx is checked out exactly once.
***************************************************************************/
void WMS::_DoCallBacks()
{
    PMSIR pmsir;

    AssertIn(_ipmsirCur, 0, _pglpmsir->IvMac() + 1);
    while (0 < _ipmsirCur)
    {
        _pglpmsir->Get(0, &pmsir);

        if (_cmhOut > 0)
        {
            // see if the MSIR is done
            int32_t imh;

            for (imh = 0; imh < kcmhMsir; imh++)
            {
                if (0 < pmsir->rgibLim[imh])
                {
                    // this one is busy
                    return;
                }
            }
        }

        // this one is done
        _pglpmsir->Delete(0);
        _ipmsirCur--;
        _mutx.Leave();

        // notify the client that we're done with the sound
        (*_pfnCall)(_luUser, pmsir->pvData, pmsir->luData);
        FreePpv((void **)&pmsir);

        _mutx.Enter();
        AssertIn(_ipmsirCur, 0, _pglpmsir->IvMac() + 1);
    }
}