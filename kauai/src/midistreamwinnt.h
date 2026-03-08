/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    MIDI stream interface: Windows NT

***************************************************************************/
#ifndef MIDISTREAMWINNT_H
#define MIDISTREAMWINNT_H

#include "midistreamwin.h"

/***************************************************************************
    Our fake midi stream class.
***************************************************************************/
typedef class OMS *POMS;
#define OMS_PAR WMSB
#define kclsOMS KLCONST3('O', 'M', 'S')
class OMS : public OMS_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    struct MSB
    {
        void *pvData;
        int32_t cb;
        int32_t ibStart;
        int32_t cactPlay;

        uintptr_t luData;
    };

    MUTX _mutx;
    HN _hevt; // event to notify the thread that the stream data has changed
    HN _hth;  // thread to play the stream data

    bool _fChanged : 1; // the event has been signalled
    bool _fStop : 1;    // tells the aux thread to stop all buffers
    bool _fDone : 1;    // tells the aux thread to return

    int32_t _imsbCur;
    PGL _pglmsb;
    PMEV _pmev;
    PMEV _pmevLim;
    uint32_t _tsCur;

    OMS(PFNMIDI pfn, uintptr_t luUser);
    bool _FInit(void);

    virtual bool _FOpen(void) override;
    virtual bool _FClose(void) override;

    static DWORD __stdcall _ThreadProc(void *pv);
    DWORD _LuThread(void);
    void _ReleaseBuffers(void);

  public:
    static POMS PomsNew(PFNMIDI pfn, uintptr_t luUser);
    ~OMS(void);

    virtual bool FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData) override;
    virtual void StopPlaying(void) override;
};

#endif //! MIDISTREAMWINNT_H
