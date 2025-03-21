/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Private audioman sound device header file.

***************************************************************************/
#ifndef SNDAMPRI_H
#define SNDAMPRI_H

/***************************************************************************
    IStream interface for a BLCK.
***************************************************************************/
typedef class STBL *PSTBL;
#define STBL_PAR IStream
class STBL : public STBL_PAR
{
    ASSERT
    MARKMEM_BASE

  protected:
    int32_t _cactRef;
    int32_t _ib;
    BLCK _blck;

    STBL(void);
    ~STBL(void);

  public:
    // IUnknown methods
    STDMETHODIMP QueryInterface(REFIID riid, void **ppv);
    STDMETHODIMP_(ULONG) AddRef(void);
    STDMETHODIMP_(ULONG) Release(void);

    // IStream methods
    STDMETHODIMP Read(void *pv, ULONG cb, ULONG *pcb);
    STDMETHODIMP Write(VOID const *pv, ULONG cb, ULONG *pcb)
    {
        if (pvNil != pcb)
            *pcb = 0;
        return E_NOTIMPL;
    }
    STDMETHODIMP Seek(LARGE_INTEGER dlibMove, DWORD dwOrigin, ULARGE_INTEGER *plibNewPosition);
    STDMETHODIMP SetSize(ULARGE_INTEGER libNewSize)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP CopyTo(IStream *pStm, ULARGE_INTEGER cb, ULARGE_INTEGER *pcbRead, ULARGE_INTEGER *pcbWritten)
    {
        if (pvNil != pcbRead)
            pcbRead->LowPart = pcbRead->HighPart = 0;
        if (pvNil != pcbWritten)
            pcbWritten->LowPart = pcbWritten->HighPart = 0;
        return E_NOTIMPL;
    }
    STDMETHODIMP Commit(DWORD grfCommitFlags)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP Revert(void)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP LockRegion(ULARGE_INTEGER libOffset, ULARGE_INTEGER cb, DWORD dwLockType)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP UnlockRegion(ULARGE_INTEGER libOffset, ULARGE_INTEGER cb, DWORD dwLockType)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP Stat(STATSTG *pstatstg, DWORD grfStatFlag)
    {
        return E_NOTIMPL;
    }
    STDMETHODIMP Clone(THIS_ IStream **ppstm)
    {
        *ppstm = pvNil;
        return E_NOTIMPL;
    }

    static PSTBL PstblNew(FLO *pflo, bool fPacked);
    int32_t CbMem(void)
    {
        return SIZEOF(STBL) + _blck.CbMem();
    }
    bool FInMemory(void)
    {
        return _blck.CbMem() > 0;
    }
};

/***************************************************************************
    Cached AudioMan Sound.
***************************************************************************/
typedef class CAMS *PCAMS;
#define CAMS_PAR BACO
#define kclsCAMS KLCONST4('C', 'A', 'M', 'S')
class CAMS : public CAMS_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    // this is just so we can do a MarkMemObj on it while AudioMan has it
    PSTBL _pstbl;

    CAMS(void);

  public:
    ~CAMS(void);
    static PCAMS PcamsNewLoop(PCAMS pcamsSrc, int32_t cactPlay);

    IAMSound *psnd; // the sound to use

    static bool FReadCams(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);
    bool FInMemory(void)
    {
        return _pstbl->FInMemory();
    }
};

/***************************************************************************
    Notify sink class.
***************************************************************************/
typedef class AMQUE *PAMQUE; // forward declaration

typedef class AMNOT *PAMNOT;
#define AMNOT_PAR IAMNotifySink
class AMNOT : public AMNOT_PAR
{
    ASSERT

  protected:
    int32_t _cactRef;
    PAMQUE _pamque; // the amque to notify

  public:
    // IUnknown methods
    STDMETHODIMP QueryInterface(REFIID riid, void **ppv);
    STDMETHODIMP_(ULONG) AddRef(void);
    STDMETHODIMP_(ULONG) Release(void);

    // IAMNotifySink methods
    STDMETHODIMP_(void) OnStart(LPSOUND pSound, DWORD dwPosition)
    {
    }
    STDMETHODIMP_(void) OnCompletion(LPSOUND pSound, DWORD dwPosition);
    STDMETHODIMP_(void) OnError(LPSOUND pSound, DWORD dwPosition, HRESULT hrError)
    {
    }
    STDMETHODIMP_(void) OnSyncObject(LPSOUND pSound, DWORD dwPosition, void *pvObject)
    {
    }

    AMNOT(void);
    void Set(PAMQUE pamque);
};

/***************************************************************************
    Audioman queue.
***************************************************************************/
#define AMQUE_PAR SNQUE
#define kclsAMQUE KLCONST4('a', 'm', 'q', 'u')
class AMQUE : public AMQUE_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    MUTX _mutx;         // restricts access to member variables
    IAMChannel *_pchan; // the audioman channel
    uint32_t _tsStart;  // when we started the current sound
    AMNOT _amnot;       // notify sink

    AMQUE(void);

    virtual void _Enter(void) override;
    virtual void _Leave(void) override;

    virtual bool _FInit(void) override;
    virtual PBACO _PbacoFetch(PRCA prca, CTG ctg, CNO cno) override;
    virtual void _Queue(int32_t isndinMin) override;
    virtual void _PauseQueue(int32_t isndinMin) override;
    virtual void _ResumeQueue(int32_t isndinMin) override;

  public:
    static PAMQUE PamqueNew(void);
    ~AMQUE(void);

    void Notify(LPSOUND psnd);
};

#endif //! SNDAMPRI_H
