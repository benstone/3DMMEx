/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    File management.

***************************************************************************/
#ifndef FILE_H
#define FILE_H

/****************************************
    Byte order issues
****************************************/

const int16_t kboCur = 0x0001;
const int16_t kboOther = 0x0100;

/****************************************
    Basic types
****************************************/

typedef int32_t FP;

enum
{
    ffilNil = 0x00,
    ffilWriteEnable = 0x01, // we can write to the file
    ffilDenyWrite = 0x02,   // others can't write to the file
    ffilDenyRead = 0x04,    // others can't read the file

    ffilTemp = 0x10,
    ffilMark = 0x20
};
const uint32_t kgrffilPerm = ffilWriteEnable | ffilDenyWrite | ffilDenyRead;

// file error levels - in order of severity
enum
{
    elNil,
    kelWrite,
    kelRead,
    kelSeek,
    kelCritical
};

/****************************************
    FIL class
****************************************/
typedef class FIL *PFIL;
#define FIL_PAR BLL
#define kclsFIL KLCONST3('F', 'I', 'L')
class FIL : public FIL_PAR
{
    RTCLASS_DEC
    BLL_DEC(FIL, PfilNext)
    ASSERT

  protected:
    // static member variables
    static MUTX _mutxList;
    static PFIL _pfilFirst;

    MUTX _mutx;

    FNI _fni;
    bool _fOpen : 1;
    bool _fEverOpen : 1;
    bool _fWrote : 1;
    uint32_t _grffil; // permissions, mark and temp flags
    int32_t _el;

#ifdef MAC
    int16_t _fref;
#elif defined(WIN)
    HANDLE _hfile;
#else
    FILE *_fp;
#endif // WIN

    // private methods
    FIL(FNI *pfni, uint32_t grffil);
    ~FIL(void);

    bool _FOpen(bool fCreate, uint32_t grffil);
    void _Close(bool fFinal = fFalse);
    void _SetFpPos(FP fp);

  public:
    // public static members
    static FTG vftgCreator;

  public:
    // static methods
    static void ClearMarks(void);
    static void CloseUnmarked(void);
    static void ShutDown(void);

    // static methods returning a PFIL
    static PFIL PfilFirst(void)
    {
        return _pfilFirst;
    }
    static PFIL PfilOpen(FNI *pfni, uint32_t grffil = ffilDenyWrite);
    static PFIL PfilCreate(FNI *pfni, uint32_t grffil = ffilWriteEnable | ffilDenyWrite);
    static PFIL PfilCreateTemp(FNI *pfni = pvNil);
    static PFIL PfilFromFni(FNI *pfni);

    virtual void Release(void) override;
    void Mark(void)
    {
        _grffil |= ffilMark;
    }

    int32_t ElError(void)
    {
        return _el;
    }
    void SetEl(int32_t el = elNil)
    {
        _el = el;
    }
    bool FSetGrffil(uint32_t grffil, uint32_t grffilMask = ~0);
    uint32_t GrffilCur(void)
    {
        return _grffil;
    }
    void SetTemp(bool fTemp = fTrue);
    bool FTemp(void)
    {
        return FPure(_grffil & ffilTemp);
    }
    void GetFni(FNI *pfni)
    {
        *pfni = _fni;
    }
    void GetStnPath(PSTN pstn);

    bool FSetFpMac(FP fp);
    FP FpMac(void);
    bool FReadRgb(void *pv, int32_t cb, FP fp);
    bool FReadRgbSeq(void *pv, int32_t cb, FP *pfp)
    {
        AssertVarMem(pfp);
        if (!FReadRgb(pv, cb, *pfp))
            return fFalse;
        *pfp += cb;
        return fTrue;
    }
    bool FWriteRgb(const void *pv, int32_t cb, FP fp);
    bool FWriteRgbSeq(const void *pv, int32_t cb, FP *pfp)
    {
        AssertVarMem(pfp);
        if (!FWriteRgb(pv, cb, *pfp))
            return fFalse;
        *pfp += cb;
        return fTrue;
    }
    bool FSwapNames(PFIL pfil);
    bool FRename(FNI *pfni);
    bool FSetFni(FNI *pfni);
    void Flush(void);
};

/****************************************
    File Location Class
****************************************/
// for AssertValid
enum
{
    ffloNil,
    ffloReadable,
};

typedef struct FLO *PFLO;
struct FLO
{
    PFIL pfil;
    FP fp;
    int32_t cb;

    bool FRead(void *pv)
    {
        return FReadRgb(pv, cb, 0);
    }
    bool FWrite(const void *pv)
    {
        return FWriteRgb(pv, cb, 0);
    }
    bool FReadRgb(void *pv, int32_t cbRead, FP dfp);
    bool FWriteRgb(const void *pv, int32_t cbWrite, FP dfp);
    bool FCopy(PFLO pfloDst);
    bool FReadHq(HQ *phq, int32_t cbRead, FP dfp = 0);
    bool FWriteHq(HQ hq, FP dfp = 0);
    bool FReadHq(HQ *phq)
    {
        return FReadHq(phq, cb, 0);
    }
    bool FTranslate(int16_t osk);

    ASSERT
};

/***************************************************************************
    Data block class - wrapper around either a flo or an hq.
***************************************************************************/
enum
{
    fblckNil = 0,
    fblckPacked = 1,
    fblckUnpacked = 2,
    fblckFile = 4,
    fblckMemory = 8,
    fblckReadable = 16,
};

typedef class BLCK *PBLCK;
#define BLCK_PAR BASE
#define kclsBLCK KLCONST4('B', 'L', 'C', 'K')
class BLCK : public BLCK_PAR
{
    RTCLASS_DEC
    NOCOPY(BLCK)
    ASSERT
    MARKMEM

  protected:
    bool _fPacked;

    // for file based blocks
    FLO _flo;

    // for memory based blocks
    HQ _hq;
    int32_t _ibMin;
    int32_t _ibLim;

  public:
    BLCK(PFLO pflo, bool fPacked = fFalse);
    BLCK(PFIL pfil, FP fp, int32_t cb, bool fPacked = fFalse);
    BLCK(HQ *phq, bool fPacked = fFalse);
    BLCK(void);
    ~BLCK(void);

    void Set(PFLO pflo, bool fPacked = fFalse);
    void Set(PFIL pfil, FP fp, int32_t cb, bool fPacked = fFalse);
    void SetHq(HQ *phq, bool fPacked = fFalse);
    void Free(void);
    HQ HqFree(bool fPackedOk = fFalse);
    int32_t Cb(bool fPackedOk = fFalse);

    // changing the range of the block
    bool FMoveMin(int32_t dib);
    bool FMoveLim(int32_t dib);

    // create a temp block
    bool FSetTemp(int32_t cb, bool fForceFile = fFalse);

    // reading from and writing to
    bool FRead(void *pv, bool fPackedOk = fFalse)
    {
        return FReadRgb(pv, Cb(fPackedOk), 0, fPackedOk);
    }
    bool FWrite(const void *pv, bool fPackedOk = fFalse)
    {
        return FWriteRgb(pv, Cb(fPackedOk), 0, fPackedOk);
    }
    bool FReadRgb(void *pv, int32_t cb, int32_t ib, bool fPackedOk = fFalse);
    bool FWriteRgb(const void *pv, int32_t cb, int32_t ib, bool fPackedOk = fFalse);
    bool FReadHq(HQ *phq, int32_t cb, int32_t ib, bool fPackedOk = fFalse);
    bool FWriteHq(HQ hq, int32_t ib, bool fPackedOk = fFalse);
    bool FReadHq(HQ *phq, bool fPackedOk = fFalse)
    {
        return FReadHq(phq, Cb(fPackedOk), 0, fPackedOk);
    }

    // writing a block to a flo or another blck.
    bool FWriteToFlo(PFLO pfloDst, bool fPackedOk = fFalse);
    bool FWriteToBlck(PBLCK pblckDst, bool fPackedOk = fFalse);
    bool FGetFlo(PFLO pflo, bool fPackedOk = fFalse);

    // packing and unpacking
    bool FPacked(int32_t *pcfmt = pvNil);
    bool FPackData(int32_t cfmt = cfmtNil);
    bool FUnpackData(void);

    // Amount of memory being used
    int32_t CbMem(void);
};

/***************************************************************************
    Message sink class. Basic interface for output streaming.
***************************************************************************/
typedef class MSNK *PMSNK;
#define MSNK_PAR BASE
#define kclsMSNK KLCONST4('M', 'S', 'N', 'K')
class MSNK : public MSNK_PAR
{
    RTCLASS_INLINE(MSNK)

  public:
    virtual void ReportLine(const PCSZ psz) = 0;
    virtual void Report(const PCSZ psz) = 0;
    virtual bool FError(void) = 0;
};

/***************************************************************************
    File based message sink.
***************************************************************************/
typedef class MSFIL *PMSFIL;
#define MSFIL_PAR MSNK
#define kclsMSFIL KLCONST4('m', 's', 'f', 'l')
class MSFIL : public MSFIL_PAR
{
    ASSERT
    RTCLASS_DEC

  protected:
    bool _fError;
    PFIL _pfil;
    FP _fpCur;
    void _EnsureFile(void);

  public:
    MSFIL(PFIL pfil = pvNil);
    ~MSFIL(void);

    virtual void ReportLine(const PCSZ psz) override;
    virtual void Report(const PCSZ psz) override;
    virtual bool FError(void) override;

    void SetFile(PFIL pfil);
    PFIL PfilRelease(void);
};

#endif //! FILE_H
