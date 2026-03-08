/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Copyright (c) Microsoft Corporation

    MIDI stream interface: Windows NT

***************************************************************************/
#include "frame.h"
#include "mdev2pri.h"
#include "midistreamwinnt.h"
ASSERTNAME

RTCLASS(OMS)

const int32_t kdtsMinSlip = kdtsSecond / 30;

/***************************************************************************
    Constructor for our own midi stream api implementation.
***************************************************************************/
OMS::OMS(PFNMIDI pfn, uintptr_t luUser) : WMSB(pfn, luUser)
{
}

/***************************************************************************
    Destructor for our midi stream.
***************************************************************************/
OMS::~OMS(void)
{
    if (hNil != _hth)
    {
        // tell the thread to end and wait for it to finish
        _fDone = fTrue;
        SetEvent(_hevt);
        WaitForSingleObject(_hth, INFINITE);
    }

    _mutx.Enter();

    if (hNil != _hevt)
        CloseHandle(_hevt);

    Assert(_hms == hNil, "Still have an HMS");
    Assert(_pglmsb->IvMac() == 0, "Still have some buffers");
    ReleasePpo(&_pglmsb);

    _mutx.Leave();
}

/***************************************************************************
    Create a new OMS.
***************************************************************************/
POMS OMS::PomsNew(PFNMIDI pfn, uintptr_t luUser)
{
    POMS poms;

    if (pvNil == (poms = NewObj OMS(pfn, luUser)))
        return pvNil;

    if (!poms->_FInit())
        ReleasePpo(&poms);

    return poms;
}

/***************************************************************************
    Initialize the OMS.
***************************************************************************/
bool OMS::_FInit(void)
{
    AssertBaseThis(0);
    DWORD luThread;

    if (pvNil == (_pglmsb = GL::PglNew(SIZEOF(MSB))))
        return fFalse;
    _pglmsb->SetMinGrow(1);

    if (hNil == (_hevt = CreateEvent(pvNil, fFalse, fFalse, pvNil)))
        return fFalse;

    // create the thread in a suspended state
    if (hNil == (_hth = CreateThread(pvNil, 1024, OMS::_ThreadProc, this, CREATE_SUSPENDED, &luThread)))
    {
        return fFalse;
    }

    SetThreadPriority(_hth, THREAD_PRIORITY_TIME_CRITICAL);

    // start the thread
    ResumeThread(_hth);

    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of a OMS.
***************************************************************************/
void OMS::AssertValid(uint32_t grf)
{
    OMS_PAR::AssertValid(0);

    _mutx.Enter();
    Assert(hNil != _hth, "nil thread");
    Assert(hNil != _hevt, "nil event");
    AssertPo(_pglmsb, 0);
    _mutx.Leave();
}

/***************************************************************************
    Mark memory for the OMS.
***************************************************************************/
void OMS::MarkMem(void)
{
    AssertValid(0);
    OMS_PAR::MarkMem();

    _mutx.Enter();
    MarkMemObj(_pglmsb);
    _mutx.Leave();
}
#endif // DEBUG

/***************************************************************************
    Open the stream.
***************************************************************************/
bool OMS::_FOpen(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (hNil != _hms)
        goto LDone;

    _fChanged = _fStop = fFalse;
    if (MMSYSERR_NOERROR != midiOutOpen(&_hms, MIDI_MAPPER, 0, 0, CALLBACK_NULL))
    {
        _hms = hNil;
        _mutx.Leave();
        return fFalse;
    }

    // get the system volume level
    _GetSysVol();

    // set our volume level
    _SetSysVlm();

LDone:
    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Close the stream.
***************************************************************************/
bool OMS::_FClose(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (hNil == _hms)
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

    // restore the volume level
    _SetSysVol(_luVolSys);

    midiOutClose(_hms);
    _hms = hNil;

    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Queue a buffer to the midi stream.
***************************************************************************/
bool OMS::FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData)
{
    AssertThis(0);
    AssertPvCb(pvData, cb);
    AssertIn(ibStart, 0, cb);
    Assert(cb % SIZEOF(MEV) == 0, "bad cb");
    Assert(ibStart % SIZEOF(MEV) == 0, "bad cb");

    MSB msb;

    _mutx.Enter();

    if (hNil == _hms)
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
        SetEvent(_hevt);
        _fChanged = fTrue;
    }

    _mutx.Leave();

    return fTrue;
}

/***************************************************************************
    Stop the stream and release all buffers. The buffer notifies are
    asynchronous.
***************************************************************************/
void OMS::StopPlaying(void)
{
    AssertThis(0);

    _mutx.Enter();

    if (hNil != _hms)
    {
        _fStop = fTrue;
        SetEvent(_hevt);
        _fChanged = fTrue;
    }

    _mutx.Leave();
}

/***************************************************************************
    AT: Static method. Thread function for the midi stream object.
***************************************************************************/
DWORD __stdcall OMS::_ThreadProc(void *pv)
{
    POMS poms = (POMS)pv;

    AssertPo(poms, 0);

    return poms->_LuThread();
}

/***************************************************************************
    AT: The midi stream playback thread.
***************************************************************************/
DWORD OMS::_LuThread(void)
{
    AssertThis(0);
    MSB msb;
    bool fChanged; // whether the event went off
    uint32_t tsCur;
    const int32_t klwInfinite = klwMax;
    int32_t dtsWait = klwInfinite;

    for (;;)
    {
        fChanged =
            dtsWait > 0 && WAIT_TIMEOUT != WaitForSingleObject(_hevt, dtsWait == klwInfinite ? INFINITE : dtsWait);

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
                    midiOutShortMsg(_hms, _pmev->dwEvent & 0x00FFFFFF);

                _pmev++;
                if (_pmev >= _pmevLim)
                    dtsWait = 0;
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
                dtsWait = 0;
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
    Release all buffers up to _imsbCur. Assumes that we have the mutx
    checked out exactly once.
***************************************************************************/
void OMS::_ReleaseBuffers(void)
{
    MSB msb;

    if (_imsbCur >= _pglmsb->IvMac() && hNil != _hms)
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
