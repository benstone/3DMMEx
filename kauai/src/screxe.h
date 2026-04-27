/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Script interpreter.  See scrcom.h and scrcom.cpp for the script
    compiler and an explanation of what a compiled script consists of.

***************************************************************************/
#ifndef SCREXE_H
#define SCREXE_H

/****************************************
    Run-Time Variable Map structure
****************************************/
struct RTVM
{
    RTVN rtvn;
    int32_t lwValue;
};

bool FFindRtvm(PGL pglrtvm, RTVN *prtvn, int32_t *plwValue, int32_t *pirtvm);
bool FAssignRtvm(PGL *ppglrtvm, RTVN *prtvn, int32_t lw);

/***************************************************************************
    A script.  This is here rather than in scrcom.* because scrcom is
    rarely included in shipping products, but screxe.* is.
***************************************************************************/
typedef class SCPT *PSCPT;
#define SCPT_PAR BACO
#define kclsSCPT KLCONST4('S', 'C', 'P', 'T')
class SCPT : public SCPT_PAR
{
    RTCLASS_DEC
    MARKMEM
    ASSERT

  protected:
    PGL _pgllw;
    PGST _pgstLiterals;
    PGST _pgstSrcLines = pvNil; // Mapping of instruction pointer to source line number

    SCPT(void)
    {
    }

    friend class SCEB;
    friend class SCCB;

#ifdef DEBUG
    FNI _fniSrc;      // Source file
    STN _stnSrcChunk; // Source chunk name

#endif // DEBUG

  public:
    static bool FReadScript(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);
    static PSCPT PscptRead(PCFL pcfl, CTG ctg, CNO cno);
    ~SCPT(void);

    bool FSaveToChunk(PCFL pcfl, CTG ctg, CNO cno, bool fPack = fFalse);
};

/***************************************************************************
    Runtime string registry.
***************************************************************************/
typedef class STRG *PSTRG;
#define STRG_PAR BASE
#define kclsSTRG KLCONST4('S', 'T', 'R', 'G')
class STRG : public STRG_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    NOCOPY(STRG)

  protected:
    int32_t _stidLast;
    PGST _pgst;

    bool _FFind(int32_t stid, int32_t *pistn);
    bool _FEnsureGst(void);

  public:
    STRG(void);
    ~STRG(void);

    bool FPut(int32_t stid, PSTN pstn);
    bool FGet(int32_t stid, PSTN pstn);
    bool FAdd(int32_t *pstid, PSTN pstn);
    bool FMove(int32_t stidSrc, int32_t stidDst);
    void Delete(int32_t stid);
};

/***************************************************************************
    The script interpreter.
***************************************************************************/
enum
{
    fscebNil = 0,
    fscebRunnable = 1,
};

typedef class SCEB *PSCEB;
#define SCEB_PAR BASE
#define kclsSCEB KLCONST4('S', 'C', 'E', 'B')
class SCEB : public SCEB_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PRCA _prca; // the chunky resource file list (may be nil)
    PSTRG _pstrg;
    PGL _pgllwStack;   // the execution stack
    PGL _pglrtvm;      // the local variables
    PSCPT _pscpt;      // the script
    int32_t _ilwMac;   // the length of the script
    int32_t _ilwCur;   // the current location in the script
    bool _fError : 1;  // an error has occured
    bool _fPaused : 1; // if we're paused
    int32_t _lwReturn; // the return value from the script

    void _Push(int32_t lw)
    {
        if (!_fError && !_pgllwStack->FPush(&lw))
            _Error(fFalse);
    }
    int32_t _LwPop(void);
    int32_t *_QlwGet(int32_t clw);
    void _Error(bool fAssert);

    void _Rotate(int32_t clwTot, int32_t clwShift);
    void _Reverse(int32_t clw);
    void _DupList(int32_t clw);
    void _PopList(int32_t clw);
    void _Select(int32_t clw, int32_t ilw);
    void _RndList(int32_t clw);
    void _Match(int32_t clw);
    void _CopySubStr(int32_t stidSrc, int32_t ichMin, int32_t cch, int32_t stidDst);
    void _MergeStrings(CNO cno, RSC rsc);
    void _NumToStr(int32_t lw, int32_t stid);
    void _StrToNum(int32_t stid, int32_t lwEmpty, int32_t lwError);
    void _ConcatStrs(int32_t stidSrc1, int32_t stidSrc2, int32_t stidDst);
    void _LenStr(int32_t stid);

    virtual void _AddParameters(int32_t *prglw, int32_t clw);
    virtual void _AddStrings(PGST pgst);
    virtual bool _FExecVarOp(int32_t op, RTVN *prtvn);
    virtual bool _FExecOp(int32_t op);
    virtual void _PushVar(PGL pglrtvm, RTVN *prtvn);
    virtual void _AssignVar(PGL *ppglrtvm, RTVN *prtvn, int32_t lw);
    virtual PGL _PglrtvmThis(void);
    virtual PGL *_PpglrtvmThis(void);
    virtual PGL _PglrtvmGlobal(void);
    virtual PGL *_PpglrtvmGlobal(void);
    virtual PGL _PglrtvmRemote(int32_t lw);
    virtual PGL *_PpglrtvmRemote(int32_t lw);

    virtual int16_t _SwCur(void);
    virtual int16_t _SwMin(void);

#ifdef DEBUG
    void _WarnSz(PCSZ psz, ...);
#endif // DEBUG

  public:
    SCEB(PRCA prca = pvNil, PSTRG pstrg = pvNil);
    ~SCEB(void);

    virtual bool FRunScript(PSCPT pscpt, int32_t *prglw = pvNil, int32_t clw = 0, int32_t *plwReturn = pvNil,
                            bool *pfPaused = pvNil);
    virtual bool FResume(int32_t *plwReturn = pvNil, bool *pfPaused = pvNil);
    virtual bool FAttachScript(PSCPT pscpt, int32_t *prglw = pvNil, int32_t clw = 0);
    virtual void Free(void);
};

#endif //! SCREXE_H
