/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Private declarations for mididev2 (streamed midi).

***************************************************************************/
#ifndef MDEV2PRI_H
#define MDEV2PRI_H

#include <thread>

// This corresponds to the Win95 MIDIEVENT structure (with no optional data).
// We're using the older headers, so need to define our own.
struct MEV
{
    DWORD dwDeltaTime; // midi ticks between this and previous event
    DWORD dwStreamID;  // reserved - must be zero
    DWORD dwEvent;
};
typedef MEV *PMEV;

/***************************************************************************
    This is the midi stream cached object.
***************************************************************************/
typedef class MDWS *PMDWS;
#define MDWS_PAR BACO
#define kclsMDWS KLCONST4('M', 'D', 'W', 'S')
class MDWS : public MDWS_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PGL _pglmev;
    uint32_t _dts;

    MDWS(void);
    bool _FInit(PMIDS pmids);

  public:
    static bool FReadMdws(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);
    static PMDWS PmdwsRead(PBLCK pblck);

    ~MDWS(void);

    uint32_t Dts(void)
    {
        return _dts;
    }
    void *PvLockData(int32_t *pcb);
    void UnlockData(void);
};

// forward declaration
typedef class MSMIX *PMSMIX;
typedef class MISI *PMISI;

/***************************************************************************
    Midi stream queue.
***************************************************************************/
typedef class MSQUE *PMSQUE;
#define MSQUE_PAR SNQUE
#define kclsMSQUE KLCONST4('m', 's', 'q', 'u')
class MSQUE : public MSQUE_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    MUTX _mutx;        // restricts access to member variables
    uint32_t _tsStart; // when we started the current sound
    PMSMIX _pmsmix;

    MSQUE(void);

    virtual void _Enter(void) override;
    virtual void _Leave(void) override;

    virtual bool _FInit(PMSMIX pmsmix);
    virtual PBACO _PbacoFetch(PRCA prca, CTG ctg, CNO cno) override;
    virtual void _Queue(int32_t isndinMin) override;
    virtual void _PauseQueue(int32_t isndinMin) override;
    virtual void _ResumeQueue(int32_t isndinMin) override;

  public:
    static PMSQUE PmsqueNew(PMSMIX pmsmix);
    ~MSQUE(void);

    void Notify(PMDWS pmdws);
};

/***************************************************************************
    Midi Stream "mixer". It really just chooses which midi stream to play
    (based on the (spr, sii) priority).
***************************************************************************/
typedef class MSMIX *PMSMIX;
#define MSMIX_PAR BASE
#define kclsMSMIX KLCONST4('m', 's', 'm', 'x')
class MSMIX : public MSMIX_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    struct MSOS
    {
        PMSQUE pmsque;     // the "channel" or queue that the sound is on
        PMDWS pmdws;       // the sound
        int32_t sii;       // its sound id (for a priority tie breaker)
        int32_t spr;       // its priority
        int32_t cactPlay;  // how many times to play the sound
        uint32_t dts;      // length of this sound
        uint32_t dtsStart; // position to start at
        int32_t vlm;       // volume to play at
        uint32_t tsStart;  // when we "started" the sound (minus dtsStart)
    };

    // Mutex to protect our member variables
    MUTX _mutx;
    HN _hevt; // to notify the thread that the sound list changed

    std::thread _thrdCleanup; // thread to terminate non-playing sounds

    PMISI _pmisi;    // the midi stream interface
    PGL _pglmsos;    // the list of current sounds, in priority order
    int32_t _cpvOut; // number of buffers submitted (0, 1, or 2)

    PGL _pglmevKey;     // to accumulate state events for seeking
    bool _fPlaying : 1; // whether we're currently playing the first stream
    bool _fWaiting : 1; // we're waiting for our buffers to get returned
    bool _fDone : 1;    // tells the aux thread to terminate

    int32_t _vlmBase;  // the base device volume
    int32_t _vlmSound; // the volume for the current sound

    MSMIX(void);
    bool _FInit(void);
    void _StopStream(void);
    bool _FGetKeyEvents(PMDWS pmdws, uint32_t dtsSeek, int32_t *pcbSkip);
    void _Restart(bool fNew = fFalse);
    void _WaitForBuffers(void);
    void _SubmitBuffers(uint32_t tsCur);

    static void _MidiProc(uintptr_t luUser, void *pvData, uintptr_t luData);
    void _Notify(void *pvData, PMDWS pmdws);

    uint32_t _LuThread(void);

  public:
    static PMSMIX PmsmixNew(void);
    ~MSMIX(void);

    bool FPlay(PMSQUE pmsque, PMDWS pmdws = pvNil, int32_t sii = siiNil, int32_t spr = 0, int32_t cactPlay = 1,
               uint32_t dtsStart = 0, int32_t vlm = kvlmFull);

    void Suspend(bool fSuspend);
    void SetVlm(int32_t vlm);
    int32_t VlmCur(void);
};

// Define these so we can use old (msvc 2.1) header files
#ifndef MEVT_SHORTMSG
#define MEVT_SHORTMSG ((BYTE)0x00) // parm = shortmsg for midiOutShortMsg
#define MEVT_TEMPO ((BYTE)0x01)    // parm = new tempo in microsec/qn
#define MEVT_NOP ((BYTE)0x02)      // parm = unused; does nothing
#define MIDIPROP_SET 0x80000000L
#define MIDIPROP_GET 0x40000000L
#define MIDIPROP_TIMEDIV 0x00000001L
#endif //! MEVT_SHORTMSG

/***************************************************************************
    The midi stream interface.
***************************************************************************/
typedef void (*PFNMIDI)(uintptr_t luUser, void *pvData, uintptr_t luData);

#define MISI_PAR BASE
#define kclsMISI KLCONST4('M', 'I', 'S', 'I')
class MISI : public MISI_PAR
{
    RTCLASS_DEC
  public:
    virtual void SetVlm(int32_t vlm) = 0;
    virtual int32_t VlmCur(void) = 0;

    virtual bool FActive(void) = 0;
    virtual bool FActivate(bool fActivate) = 0;

    virtual bool FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData) = 0;
    virtual void StopPlaying(void) = 0;
};

#endif //! MDEV2PRI_H
