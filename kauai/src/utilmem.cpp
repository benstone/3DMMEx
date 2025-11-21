/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Shared (between Mac and Win) memory allocation routines.

    The APIs in this module implement fixed block (non-moveable,
    non-resizeable) memory management.  On win, we use GlobalAlloc; on Mac
    we use ::operator new.  The win hq is based on FAllocPv.  The mac
    hq is a Mac handle.  _FResizePpv is win only (needed for
    resizing HQs) and considered private to the memory management code
    (if the implementation of Win HQs changes, it will go away).
***************************************************************************/
#include "util.h"
ASSERTNAME

#ifdef DEBUG
const int32_t kclwStackMbh = 5;

// memory block header
struct MBH
{
    int32_t cb;                      // size of block, including header and footer
    PSZS pszsFile;                   // source file that allocation request is coming from
    int32_t lwLine;                  // line in file that allocation request is coming from
    int32_t lwThread;                // thread id
    MBH *pmbhPrev;                   // previous allocated block (in doubly linked list)
    MBH *pmbhNext;                   // next allocated block
    int32_t rglwStack[kclwStackMbh]; // the EBP/A6 chain
    int16_t cactRef;                 // for marking memory
    int16_t swMagic;                 // magic number, to detect memory trashing
};

// memory block footer
struct MBF
{
    int16_t swMagic; // magic number, to detect memory trashing
};

MBH *_pmbhFirst; // head of the doubly linked list

priv void _LinkMbh(MBH *pmbh);
priv void _UnlinkMbh(MBH *pmbh, MBH *pmbhOld);
priv void _AssertMbh(MBH *pmbh);
#endif // DEBUG

#ifdef MAC
#define malloc(cb) ::operator new(cb)
#define free(pv) delete (pv)
#endif // MAC
#ifdef WIN
#define malloc(cb) (void *)GlobalAlloc(GMEM_FIXED, cb)
#define free(pv) GlobalFree((HGLOBAL)pv)
#define _msize(pv) GlobalSize((HGLOBAL)pv)
#define realloc(pv, cb) (void *)GlobalReAlloc((HGLOBAL)pv, cb, GMEM_MOVEABLE)
#endif // WIN

PFNLIB vpfnlib = pvNil;
bool _fInLiberator = fFalse;

#ifdef DEBUG
/***************************************************************************
    Do simulated failure testing.
***************************************************************************/
bool DMAGL::FFail(void)
{
    bool fRet = fFalse;

    vmutxMem.Enter();
    if (cactFail > 0)
    {
        if (cactDo <= 0)
        {
            cactFail--;
            fRet = fTrue;
        }
        else
            cactDo--;
    }
    vmutxMem.Leave();

    return fRet;
}

/***************************************************************************
    Update values after an allocation
***************************************************************************/
void DMAGL::Allocate(int32_t cbT)
{
    vmutxMem.Enter();
    if (cvRun < ++cv)
        cvRun = cv;
    cvTot++;
    if (cbRun < (cb += cbT))
        cbRun = cb;
    vmutxMem.Leave();
}

/***************************************************************************
    Update values after a resize
***************************************************************************/
void DMAGL::Resize(int32_t dcb)
{
    vmutxMem.Enter();
    if (cbRun < (cb += dcb))
        cbRun = cb;
    vmutxMem.Leave();
}

/***************************************************************************
    Update values after a block is freed
***************************************************************************/
void DMAGL::Free(int32_t cbT)
{
    --cv;
    cb -= cbT;
}
#endif // DEBUG

/***************************************************************************
    Allocates a fixed block.
***************************************************************************/
#ifdef DEBUG
bool FAllocPvDebug(void **ppv, int32_t cb, uint32_t grfmem, int32_t mpr, PSZS pszsFile, int32_t lwLine, DMAGL *pdmagl)
#else  //! DEBUG
bool FAllocPv(void **ppv, int32_t cb, uint32_t grfmem, int32_t mpr)
#endif //! DEBUG
{
    AssertVarMem(ppv);
    AssertIn(cb, 0, kcbMax);
    int32_t cbFree;

    if (cb > kcbMax)
    {
        BugVar("who's allocating a humongous block?", &cb);
        goto LFail;
    }

#ifdef DEBUG
    // do simulated failure
    if (pdmagl->FFail())
        goto LFail;

    vmutxMem.Enter();
    if (pvNil != _pmbhFirst)
        _AssertMbh(_pmbhFirst);
    vmutxMem.Leave();

    Assert(cb + SIZEOF(MBH) + SIZEOF(MBF) > cb, 0);
    cb += SIZEOF(MBH) + SIZEOF(MBF);
#endif // DEBUG

    for (;;)
    {
        *ppv = malloc(cb);
        if (pvNil != *ppv || pvNil == vpfnlib)
            break;

        vmutxMem.Enter();
        if (_fInLiberator)
            cbFree = 0;
        else
        {
            _fInLiberator = fTrue;
            vmutxMem.Leave();
            cbFree = (*vpfnlib)(cb, mpr);
            vmutxMem.Enter();
            _fInLiberator = fFalse;
        }
        vmutxMem.Leave();

        if (cbFree <= 0)
            break;
    }

    if (pvNil == *ppv)
    {
    LFail:
        *ppv = pvNil;
        PushErc(ercOomPv);
        return fFalse;
    }

    if (grfmem & fmemClear)
        ClearPb(*ppv, cb);
#ifdef DEBUG
    else
        FillPb(*ppv, cb, kbGarbage);

    // fill in the header
    MBH *pmbh = (MBH *)*ppv;
    *ppv = pmbh + 1;
    pmbh->cb = cb;
    pmbh->swMagic = kswMagicMem;
    pmbh->pszsFile = pszsFile;
    pmbh->lwLine = lwLine;
    pmbh->lwThread = LwThreadCur();

#if defined(WIN) && defined(IN_80386)
    // follow the EBP chain....
    int32_t *plw;
    int32_t ilw;

    __asm { mov plw,ebp }
    for (ilw = 0; ilw < kclwStackMbh; ilw++)
    {
        if (pvNil == plw || IsBadReadPtr(plw, 2 * SIZEOF(int32_t)) || *plw <= (int32_t)plw)
        {
            pmbh->rglwStack[ilw] = 0;
            plw = pvNil;
        }
        else
        {
            pmbh->rglwStack[ilw] = plw[1];
            plw = (int32_t *)*plw;
        }
    }
#endif // WIN && IN_80386

    // write the footer
    MBF mbf;
    mbf.swMagic = kswMagicMem;
    CopyPb(&mbf, PvAddBv(pmbh, cb - SIZEOF(MBF)), SIZEOF(MBF));

    // link the block
    _LinkMbh(pmbh);

    // update statistics
    pdmagl->Allocate(cb - SIZEOF(MBF) - SIZEOF(MBH));

    AssertPvAlloced(*ppv, cb - SIZEOF(MBF) - SIZEOF(MBH));
#endif // DEBUG

    return fTrue;
}

#ifndef MAC
/***************************************************************************
    Resizes the given block.  *ppv may change.  If fmemClear, clears any
    newly added space.
***************************************************************************/
#ifdef DEBUG
bool _FResizePpvDebug(void **ppv, int32_t cbNew, int32_t cbOld, uint32_t grfmem, int32_t mpr, DMAGL *pdmagl)
#else  //! DEBUG
bool _FResizePpv(void **ppv, int32_t cbNew, int32_t cbOld, uint32_t grfmem, int32_t mpr)
#endif //! DEBUG
{
    AssertVarMem(ppv);
    AssertIn(cbNew, 0, kcbMax);
    AssertIn(cbOld, 0, kcbMax);
    AssertPvAlloced(*ppv, cbOld);
    int32_t cbFree;
    void *pvNew, *pvOld;

#ifdef DEBUG
    MBH *pmbh = (MBH *)PvSubBv(*ppv, SIZEOF(MBH));
    _AssertMbh(pmbh);
#endif // DEBUG

    if (cbNew > kcbMax)
    {
        BugVar("who's resizing a humongous block?", &cbNew);
        goto LFail;
    }

    pvOld = *ppv;
#ifdef DEBUG
    // do simulated failure - we can only fail if the block is growing
    if (cbNew > cbOld && pdmagl->FFail())
        goto LFail;

    // assert we don't overflow (the limit of kcbMax should ensure this)
    Assert(cbOld + SIZEOF(MBH) + SIZEOF(MBF) > cbOld, 0);
    Assert(cbNew + SIZEOF(MBH) + SIZEOF(MBF) > cbNew, 0);
    cbOld += SIZEOF(MBH) + SIZEOF(MBF);
    cbNew += SIZEOF(MBH) + SIZEOF(MBF);
    AssertVar(pmbh->cb == cbOld, "bad cbOld value passed to _FResizePpv", &cbOld);

    // trash the old stuff
    if (cbOld > cbNew)
        FillPb(PvAddBv(pmbh, cbNew), cbOld - cbNew, kbGarbage);
    pvOld = pmbh;
#endif // DEBUG

    for (;;)
    {
        pvNew = realloc(pvOld, cbNew);

        if (pvNil != pvNew || pvNil == vpfnlib)
            break;

        vmutxMem.Enter();
        if (_fInLiberator)
            cbFree = 0;
        else
        {
            _fInLiberator = fTrue;
            vmutxMem.Leave();
            cbFree = (*vpfnlib)(cbNew - cbOld, mpr);
            vmutxMem.Enter();
            _fInLiberator = fFalse;
        }
        vmutxMem.Leave();

        if (cbFree <= 0)
            break;
    }

    if (pvNil == pvNew)
    {
        Assert(cbOld < cbNew, "why did shrinking fail?");
    LFail:
        AssertPvAlloced(*ppv, cbOld - SIZEOF(MBH) - SIZEOF(MBF));
        PushErc(ercOomPv);

        return fFalse;
    }
    *ppv = pvNew;

    if ((grfmem & fmemClear) && cbOld < cbNew)
    {
        // Clear the new stuff
        ClearPb(PvAddBv(pvNew, cbOld), cbNew - cbOld);
    }

#ifdef DEBUG
    if ((grfmem & fmemClear) && cbOld < cbNew)
        ClearPb(PvAddBv(pvNew, cbOld - SIZEOF(MBF)), SIZEOF(MBF));
    else if (cbOld < cbNew)
    {
        // fill the new stuff with garbage
        FillPb(PvAddBv(pvNew, cbOld - SIZEOF(MBF)), cbNew - cbOld + SIZEOF(MBF), kbGarbage);
    }

    // update the header
    if (pvNew != pmbh)
    {
        _UnlinkMbh((MBH *)pvNew, pmbh);
        pmbh = (MBH *)pvNew;
        _LinkMbh(pmbh);
    }
    *ppv = pmbh + 1;
    pmbh->cb = cbNew;

    // write the footer
    MBF mbf;
    mbf.swMagic = kswMagicMem;
    CopyPb(&mbf, PvAddBv(pmbh, cbNew - SIZEOF(MBF)), SIZEOF(MBF));
    AssertPvAlloced(*ppv, cbNew - SIZEOF(MBF) - SIZEOF(MBH));

    // update statistics
    pdmagl->Resize(cbNew - cbOld);
#endif // DEBUG

    return fTrue;
}
#endif // MAC

/***************************************************************************
    If *ppv is not nil, frees it and sets *ppv to nil.
***************************************************************************/
#ifdef DEBUG
void FreePpvDebug(void **ppv, DMAGL *pdmagl)
#else  //! DEBUG
void FreePpv(void **ppv)
#endif //! DEBUG
{
    AssertVarMem(ppv);
    if (*ppv == pvNil)
        return;

#ifdef DEBUG
    MBH *pmbh = (MBH *)PvSubBv(*ppv, SIZEOF(MBH));
    _AssertMbh(pmbh);
    _UnlinkMbh(pmbh, pmbh);

    // update statistics
    pdmagl->Free(pmbh->cb - SIZEOF(MBF) - SIZEOF(MBH));

    // fill the block with garbage before freeing it
    FillPb(pmbh, pmbh->cb, kbGarbage);
    *ppv = pmbh;
#endif // DEBUG

    free(*ppv);
    *ppv = pvNil;
}

#ifdef DEBUG
/***************************************************************************
    Link the Mbh into the debug-only doubly linked list.
***************************************************************************/
priv void _LinkMbh(MBH *pmbh)
{
    AssertVarMem(pmbh);

    vmutxMem.Enter();
    pmbh->pmbhPrev = pvNil;
    pmbh->pmbhNext = _pmbhFirst;
    if (_pmbhFirst != pvNil)
    {
        Assert(_pmbhFirst->pmbhPrev == pvNil, "_pmbhFirst's prev is not nil");
        _pmbhFirst->pmbhPrev = pmbh;
    }
    _pmbhFirst = pmbh;
    vmutxMem.Leave();
}

/***************************************************************************
    Unlink the MBH from the debug-only doubly linked list.  pmbhOld is the
    previous value of the linked block.  pmbhOld may not be a valid pointer
    now (when mem is resized).
***************************************************************************/
priv void _UnlinkMbh(MBH *pmbh, MBH *pmbhOld)
{
    AssertVarMem(pmbh);
    Assert(pmbhOld != pvNil, 0);

    vmutxMem.Enter();
    // update prev's next pointer
    if (pvNil == pmbh->pmbhPrev)
    {
        Assert(_pmbhFirst == pmbhOld, "prev is wrongly nil");
        _pmbhFirst = pmbh->pmbhNext;
    }
    else
    {
        Assert(_pmbhFirst != pmbhOld, "prev should be nil");
        Assert(pmbh->pmbhPrev->pmbhNext == pmbhOld, "prev's next wrong");
        pmbh->pmbhPrev->pmbhNext = pmbh->pmbhNext;
    }

    // update next's prev pointer
    if (pvNil != pmbh->pmbhNext)
    {
        Assert(pmbh->pmbhNext->pmbhPrev == pmbhOld, "next's prev wrong");
        pmbh->pmbhNext->pmbhPrev = pmbh->pmbhPrev;
    }
    vmutxMem.Leave();
}

/***************************************************************************
    Validate the MBH and the block that it is the head of.
***************************************************************************/
void _AssertMbh(MBH *pmbh)
{
    int16_t sw;

    if (vcactSuspendCheckPointers != 0)
        return;

    vmutxMem.Enter();
    AssertVarMem(pmbh);
    Assert(pmbh->swMagic == kswMagicMem, "bad magic number");
    AssertIn(pmbh->cb - SIZEOF(MBH) - SIZEOF(MBF), 0, kcbMax);
#ifdef WIN
    Assert(pmbh->cb <= (int32_t)_msize(pmbh), "bigger than malloced block");
#endif
    AssertPvCb(pmbh, pmbh->cb);
    if (pmbh->pmbhPrev != pvNil)
    {
        AssertVarMem(pmbh->pmbhPrev);
        Assert(pmbh->pmbhPrev->pmbhNext == pmbh, "wrong next in prev");
        Assert(pmbh != _pmbhFirst, "first has prev!");
    }
    if (pmbh->pmbhNext != pvNil)
    {
        AssertVarMem(pmbh->pmbhNext);
        Assert(pmbh->pmbhNext->pmbhPrev == pmbh, "wrong prev in next");
    }

    ((uint8_t *)&sw)[0] = *(uint8_t *)PvAddBv(pmbh, pmbh->cb - 2);
    ((uint8_t *)&sw)[1] = *(uint8_t *)PvAddBv(pmbh, pmbh->cb - 1);
    Assert(sw == kswMagicMem, "bad tail magic number");
    vmutxMem.Leave();
}

/***************************************************************************
    Assert the validity of an allocated fixed block.  Cb is the size.
    If cb is unknown, pass cvNil.
***************************************************************************/
void AssertPvAlloced(void *pv, int32_t cb)
{
    if (vcactSuspendCheckPointers != 0)
        return;

    Assert(pv != pvNil, "nil pv");
    MBH *pmbh = (MBH *)PvSubBv(pv, SIZEOF(MBH));
    _AssertMbh(pmbh);
    if (cb != cvNil)
        Assert(pmbh->cb == cb + SIZEOF(MBH) + SIZEOF(MBF), "wrong cb");
}

/***************************************************************************
    Asserts on unmarked blocks.
***************************************************************************/
void AssertUnmarkedMem(void)
{
    MBH *pmbh;
    int32_t lwThread = LwThreadCur();

    // enter the critical section
    vmutxMem.Enter();

    for (pmbh = _pmbhFirst; pmbh != pvNil; pmbh = pmbh->pmbhNext)
    {
        _AssertMbh(pmbh);
        if (pmbh->cactRef == 0 && pmbh->lwThread == lwThread)
        {
            STN stn;
            SZS szs;

            stn.FFormatSz(PszLit("\nLost block: size=%d, StackTrace=(use map file)"), pmbh->cb);
            stn.GetSzs(szs);

            if (FAssertProc(pmbh->pszsFile, pmbh->lwLine, szs, pmbh->rglwStack, kclwStackMbh * SIZEOF(int32_t)))
            {
                Debugger();
            }
        }
    }
#ifdef MAC
    _AssertUnmarkedHqs();
#endif
    // leave the critical section
    vmutxMem.Leave();
}

/***************************************************************************
    Clears all marks on memory blocks.
***************************************************************************/
void UnmarkAllMem(void)
{
    MBH *pmbh;
    int32_t lwThread = LwThreadCur();

    // enter the critical section
    vmutxMem.Enter();

    for (pmbh = _pmbhFirst; pmbh != pvNil; pmbh = pmbh->pmbhNext)
    {
        _AssertMbh(pmbh);
        if (pmbh->lwThread == lwThread)
            pmbh->cactRef = 0;
    }
#ifdef MAC
    _UnmarkAllHqs();
#endif

    // leave the critical section
    vmutxMem.Leave();
}

/***************************************************************************
    Increment the ref count on an allocated pv.
***************************************************************************/
void MarkPv(void *pv)
{
    if (pvNil != pv)
    {
        AssertPvAlloced(pv, cvNil);
        MBH *pmbh = (MBH *)PvSubBv(pv, SIZEOF(MBH));
        pmbh->cactRef++;
    }
}
#endif // DEBUG
