/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    MIDI stream interface: Windows 95

***************************************************************************/
#ifndef MIDISTREAMWIN95_H
#define MIDISTREAMWIN95_H

#include "midistreamwin.h"

// This corresponds to the Win95 MIDIHDR structure.
// We're using the older headers, so need to define our own.
struct MH
{
    uint8_t *lpData;
    DWORD dwBufferLength;
    DWORD dwBytesRecorded;
    DWORD_PTR dwUser;
    DWORD dwFlags;
    MH *lpNext;
    DWORD_PTR reserved;
    DWORD dwOffset;
    DWORD_PTR dwReserved[8];
};
typedef MH *PMH;

typedef MIDIHDR *PMHO;

/***************************************************************************
    The midiStreamStop API has a bug in it where it doesn't reset the
    current "buffer position" so that after calling midiStreamStop, then
    midiStreamOut and midiStreamRestart, the new buffer isn't played
    immediately, but the system waits until the previous buffer position
    expires before playing the new buffer.

    When this bug is fixed, STREAM_BUG can be undefined.
***************************************************************************/
#define STREAM_BUG

/***************************************************************************
    The real midi stream interface.
***************************************************************************/
typedef class WMS *PWMS;
#define WMS_PAR WMSB
#define kclsWMS KLCONST3('W', 'M', 'S')
class WMS : public WMS_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
#define kcmhMsir 2
    struct MSIR
    {
        void *pvData;
        int32_t cb;
        int32_t cactPlay;
        uintptr_t luData;
        int32_t ibNext;

        MH rgmh[kcmhMsir];
        int32_t rgibLim[kcmhMsir];
    };
    typedef MSIR *PMSIR;

    MUTX _mutx;
    HINSTANCE _hlib;
    PGL _pglpmsir;
    int32_t _ipmsirCur;
    int32_t _cmhOut;

    HN _hevt; // event to wake up the thread
    HN _hth;  // thread to do callbacks and cleanup after a notify

#ifdef STREAM_BUG
    std::atomic<bool> _fActive;
#endif // STREAM_BUG

    std::atomic<bool> _fDone; // tells the aux thread to terminate

    MMRESULT(WINAPI *_pfnOpen)
    (HMS *phms, LPUINT puDeviceID, DWORD cMidi, DWORD_PTR dwCallback, DWORD_PTR dwInstance, DWORD fdwOpen);
    MMRESULT(WINAPI *_pfnClose)(HMS hms);
    MMRESULT(WINAPI *_pfnProperty)(HMS hms, LPBYTE lpb, DWORD dwProperty);
    MMRESULT(WINAPI *_pfnPosition)(HMS hms, LPMMTIME lpmmt, UINT cbmmt);
    MMRESULT(WINAPI *_pfnOut)(HMS hms, LPMIDIHDR pmh, UINT cbmh);
    MMRESULT(WINAPI *_pfnPause)(HMS hms);
    MMRESULT(WINAPI *_pfnRestart)(HMS hms);
    MMRESULT(WINAPI *_pfnStop)(HMS hms);

    WMS(PFNMIDI pfn, uintptr_t luUser);
    bool _FInit(void);

    virtual bool _FOpen(void) override;
    virtual bool _FClose(void) override;

    bool _FSubmit(PMH pmh);
    void _DoCallBacks(void);
    int32_t _CmhSubmitBuffers(void);
    void _ResetStream(void);

    // MidiOutProc callback function
    static void __stdcall _MidiProc(HMS hms, UINT msg, DWORD_PTR luUser, DWORD_PTR lu1, DWORD_PTR lu2);
    void _Notify(HMS hms, PMH pmh);

    static DWORD __stdcall _ThreadProc(void *pv);
    DWORD _LuThread(void);

  public:
    static PWMS PwmsNew(PFNMIDI pfn, uintptr_t luUser);
    ~WMS(void);

#ifdef STREAM_BUG
    virtual bool FActive(void) override;
    virtual bool FActivate(bool fActivate) override;
#endif // STREAM_BUG

    virtual bool FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData) override;
    virtual void StopPlaying(void) override;
};

#endif //! MIDISTREAMWIN95_H
