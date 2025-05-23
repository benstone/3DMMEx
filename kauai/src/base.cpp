/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Base classes.  Base class that all other classes are derived from and
    a base linked list class for implementing singly linked lists.

***************************************************************************/
#include "util.h"
ASSERTNAME

#ifdef DEBUG
int32_t vcactSuspendAssertValid = 0;
int32_t vcactAVSave = 0;
int32_t vcactAV = kswMax;

/*****************************************************************************
    Debugging stuff to track leaked allocated objects.
******************************************************************************/
// Debugging object info.
const int32_t kclwStackDoi = 10;
struct DOI
{
    int16_t swMagic;       // magic number == kswMagicMem
    int16_t cactRef;       // for marking memory and asserting on unused objects
    PSZS pszsFile;         // file NewObj appears in
    int32_t lwLine;        // line NewObj appears on
    int32_t cbTot;         // total size of the block, including the DOI
    int32_t lwThread;      // thread that allocated this
    int32_t rglwStack[10]; // what we get from following the EBP/A6 chain
    DOI *pdoiNext;         // singly linked list
    DOI **ppdoiPrev;
};

#define kcbBaseDebug SIZEOF(DOI)

priv void _AssertDoi(DOI *pdoi, bool tLinked);
inline DOI *_PdoiFromBase(void *pv)
{
    return (DOI *)PvSubBv(pv, kcbBaseDebug);
}
inline BASE *_PbaseFromDoi(DOI *pdoi)
{
    return (BASE *)PvAddBv(pdoi, kcbBaseDebug);
}
priv void _LinkDoi(DOI *pdoi, DOI **ppdoiFirst);
priv void _UnlinkDoi(DOI *pdoi);

DOI *_pdoiFirst;    // Head of linked list of all allocated objects.
DOI *_pdoiFirstRaw; // Head of linked list of raw newly allocated objects.

inline void _Enter(void)
{
    vmutxBase.Enter();
}
inline void _Leave(void)
{
    vmutxBase.Leave();
}

#define klwMagicAllocatedBase KLCONST4('A', 'L', 'O', 'C')
#define klwMagicNonAllocBase KLCONST4('N', 'O', 'A', 'L')

#else //! DEBUG
#define kcbBaseDebug 0
#endif //! DEBUG

RTCLASS(BLL)

/***************************************************************************
    Returns the run-time class id (cls) of the class.
***************************************************************************/
int32_t BASE::Cls(void)
{
    return kclsBASE;
}

/***************************************************************************
    Returns true iff cls is kclsBASE.
***************************************************************************/
bool BASE::FIs(int32_t cls)
{
    return kclsBASE == cls;
}

/***************************************************************************
    Static method. Returns true iff cls is kclsBASE.
***************************************************************************/
bool BASE::FWouldBe(int32_t cls)
{
    return kclsBASE == cls;
}

/***************************************************************************
    Constructor for a BASE object.  Sets _cactRef to 1 and in debug sets
    the magic number to indicate whether the thing was allocated.
***************************************************************************/
BASE::BASE(void)
{
    _cactRef = 1;
#ifdef DEBUG
    DOI *pdoi = _pdoiFirstRaw;

    if (pvNil != pdoi)
    {
        // Note that we have to check _pdoiFirstRaw before entering the
        // mutx so we don't try to enter the mutx before it's been
        // initialized (during global object construction).
        _Enter();

        // see if this is in the raw list - note that we have to refresh
        // _pdoiFirstRaw in case another thread grabbed it before we got
        // the critical section
        for (pdoi = _pdoiFirstRaw; pdoi != pvNil && this != _PbaseFromDoi(pdoi); pdoi = pdoi->pdoiNext)
        {
            _AssertDoi(pdoi, tYes);
        }

        if (pvNil != pdoi)
        {
            // this is us!
            _UnlinkDoi(pdoi);
            _LinkDoi(pdoi, &_pdoiFirst);

            _lwMagic = klwMagicAllocatedBase;
            AssertValid(0);
        }

        _Leave();
    }

    if (pvNil == pdoi)
    {
        _lwMagic = klwMagicNonAllocBase;
        // don't call AssertValid here, since this may be during
        // global initialization (FAssertProc and/or AssertPvCb may not be
        // callable).
    }

#endif // DEBUG
}

/***************************************************************************
    Increments the reference count.
***************************************************************************/
void BASE::AddRef(void)
{
    AssertThis(0);
    _cactRef++;

    // NOTE: some classes allow _cactRef == 0, so we can't assert _cactRef > 1
    Assert(_cactRef > 0, "_cactRef not positive");
}

/***************************************************************************
    Decrement the reference count and delete it if the reference count goes
    to zero.
***************************************************************************/
void BASE::Release(void)
{
    AssertThis(0);
    if (--_cactRef <= 0)
    {
        AssertThis(fobjAllocated);
        delete this;
    }
}

/***************************************************************************
    Used to allocate all objects.  Clears the block and in debug, adds
    magic number, reference count for marking and inserts in linked list
    of allocated objects for object leakage tracking.
***************************************************************************/
#ifdef DEBUG
void *BASE::operator new(size_t cb, PSZS pszsFile, int32_t lwLine) noexcept
#else  //! DEBUG
void *BASE::operator new(size_t cb) noexcept
#endif //! DEBUG
{
    AssertVarMem(pszsFile);
    void *pv;

#ifdef DEBUG
    // do failure simulation
    _Enter();

    if (vdmglob.dmaglBase.FFail())
    {
        _Leave();
        PushErc(ercOomNew);
        return pvNil;
    }

    _Leave();
#endif // DEBUG

#ifdef WIN
    if ((pv = (void *)GlobalAlloc(GMEM_FIXED | GMEM_ZEROINIT, cb + kcbBaseDebug)) == pvNil)
#else  //! WIN
    if ((pv = ::operator new(cb + kcbBaseDebug)) == pvNil)
#endif //! WIN
        PushErc(ercOomNew);
    else
    {
#ifdef DEBUG
        _Enter();

        DOI *pdoi = (DOI *)pv;

        pdoi->swMagic = kswMagicMem;
        pdoi->cactRef = 0;
        pdoi->pszsFile = pszsFile;
        pdoi->lwLine = lwLine;
        pdoi->cbTot = cb + kcbBaseDebug;
        pdoi->lwThread = LwThreadCur();
        pdoi->ppdoiPrev = pvNil;
        _LinkDoi(pdoi, &_pdoiFirstRaw);
        pv = _PbaseFromDoi(pdoi);

#if defined(WIN) && defined(IN_80386)
        // follow the EBP chain....
        int32_t *plw;
        int32_t ilw;

        __asm { mov plw,ebp }
        for (ilw = 0; ilw < kclwStackDoi; ilw++)
        {
            if (pvNil == plw || IsBadReadPtr(plw, 2 * SIZEOF(int32_t)) || *plw <= (int32_t)plw)
            {
                pdoi->rglwStack[ilw] = 0;
                plw = pvNil;
            }
            else
            {
                pdoi->rglwStack[ilw] = plw[1];
                plw = (int32_t *)*plw;
            }
        }
#endif // WIN && IN_80386

        // update statistics
        vdmglob.dmaglBase.Allocate(cb);

        _Leave();
#endif // DEBUG
#ifndef WIN
        ClearPb(pv, cb);
#endif //! WIN
    }
    return pv;
}

#if defined(DEBUG) || defined(WIN)

/***************************************************************************
    DEBUG : Unlink from linked list of allocated objects and free the memory.
***************************************************************************/
void BASE::operator delete(void *pv)
{
#ifdef DEBUG
    DOI *pdoi = _PdoiFromBase(pv);

    _UnlinkDoi(pdoi);

    // update statistics
    vdmglob.dmaglBase.Free(pdoi->cbTot - kcbBaseDebug);

    TrashPvCb(pdoi, pdoi->cbTot);
    pv = pdoi;
#endif // DEBUG
#ifdef WIN
    GlobalFree((HGLOBAL)pv);
#else  //! WIN
    ::delete (pv);
#endif //! WIN
}

#ifdef DEBUG
void BASE::operator delete(void *pv, schar *pszsFile, int32_t lwLine)
{
    BASE::operator delete(pv);
}
#endif // DEBUG

#endif // DEBUG || WIN

#ifdef DEBUG
/***************************************************************************
    Assert the this pointer is valid.
***************************************************************************/
void BASE::AssertValid(uint32_t grfobj)
{
    AssertVarMem(this);
    AssertIn(_cactRef, 0, kcbMax);
    if (_lwMagic != klwMagicAllocatedBase)
    {
        Assert(!(grfobj & fobjAllocated), "should be allocated");
        AssertVar(_lwMagic == klwMagicNonAllocBase, "_lwMagic wrong", &_lwMagic);
        AssertPvCb(this, SIZEOF(BASE));
        return;
    }
    Assert(!(grfobj & fobjNotAllocated), "should not be allocated");

    _Enter();

    DOI *pdoi = _PdoiFromBase(this);
    _AssertDoi(pdoi, tYes);

    _Leave();
}

/***************************************************************************
    If this objects has already been marked, just return. If not, call
    its MarkMem method.
***************************************************************************/
void BASE::MarkMemStub(void)
{
    AssertThis(0);
    if (_lwMagic != klwMagicAllocatedBase)
    {
        AssertVar(_lwMagic == klwMagicNonAllocBase, "_lwMagic wrong", &_lwMagic);
        MarkMem();
        return;
    }

    DOI *pdoi = _PdoiFromBase(this);
    if (pdoi->cactRef == 0 && pdoi->lwThread == LwThreadCur())
        MarkMem();
}

/***************************************************************************
    Mark object.
***************************************************************************/
void BASE::MarkMem(void)
{
    AssertValid(0);
    if (_lwMagic == klwMagicAllocatedBase)
        _PdoiFromBase(this)->cactRef++;
}

/***************************************************************************
    Assert that a doi is valid and optionally linked or unlinked.
***************************************************************************/
void _AssertDoi(DOI *pdoi, bool tLinked)
{
    _Enter();

    AssertPvCb(pdoi, SIZEOF(BASE) + kcbBaseDebug);
    AssertIn(pdoi->cbTot, SIZEOF(BASE) + kcbBaseDebug, kcbMax);
    AssertPvCb(pdoi, pdoi->cbTot);

    AssertVar(pdoi->swMagic == kswMagicMem, "magic number has been hammered", &pdoi->swMagic);
    AssertVar(pdoi->cactRef >= 0, "negative reference count", &pdoi->cactRef);
    if (pvNil == pdoi->ppdoiPrev)
        Assert(tLinked != tYes, "should be linked");
    else
    {
        Assert(tLinked != tNo, "should NOT be linked");

        AssertVarMem(pdoi->ppdoiPrev);
        AssertVar(*pdoi->ppdoiPrev == pdoi, "*ppdoiPrev is wrong", pdoi->ppdoiPrev);
        if (pdoi->pdoiNext != pvNil)
        {
            AssertVarMem(pdoi->pdoiNext);
            AssertVar(pdoi->pdoiNext->ppdoiPrev == &pdoi->pdoiNext, "ppdoiPrev in next is wrong",
                      &pdoi->pdoiNext->ppdoiPrev);
        }
    }

    _Leave();
}

/***************************************************************************
    Link object into list.
***************************************************************************/
priv void _LinkDoi(DOI *pdoi, DOI **ppdoiFirst)
{
    _Enter();

    _AssertDoi(pdoi, tNo);
    AssertVarMem(ppdoiFirst);

    if (*ppdoiFirst != pvNil)
    {
        _AssertDoi(*ppdoiFirst, tYes);
        (*ppdoiFirst)->ppdoiPrev = &pdoi->pdoiNext;
    }
    pdoi->pdoiNext = *ppdoiFirst;
    pdoi->ppdoiPrev = ppdoiFirst;
    *ppdoiFirst = pdoi;
    _AssertDoi(pdoi, tYes);

    _Leave();
}

/***************************************************************************
    Unlink object from list.
***************************************************************************/
priv void _UnlinkDoi(DOI *pdoi)
{
    _Enter();

    _AssertDoi(pdoi, tYes);
    *pdoi->ppdoiPrev = pdoi->pdoiNext;
    if (pvNil != pdoi->pdoiNext)
    {
        pdoi->pdoiNext->ppdoiPrev = pdoi->ppdoiPrev;
        _AssertDoi(pdoi->pdoiNext, tYes);
    }
    pdoi->ppdoiPrev = pvNil;
    pdoi->pdoiNext = pvNil;
    _AssertDoi(pdoi, tNo);

    _Leave();
}

/***************************************************************************
    Called if anyone tries to copy a class with NOCOPY(cls) in its
    declaration.
***************************************************************************/
void __AssertOnCopy(void)
{
    Bug("Copying a non-copyable object");
}

/***************************************************************************
    Asserts on unmarked allocated (BASE) objects.
***************************************************************************/
void AssertUnmarkedObjs(void)
{
    _Enter();

    STN stn;
    SZS szs;
    BASE *pbase;
    DOI *pdoi;
    DOI *pdoiLast;
    bool fAssert;
    int32_t cdoiLost = 0;
    int32_t lwThread = LwThreadCur();

    Assert(_pdoiFirstRaw == pvNil, "Raw list is not empty!");

    // we want to traverse the list in the reverse order to report problems
    // find the end of the list and see if there are any lost blocks
    pdoiLast = pvNil;
    for (pdoi = _pdoiFirst; pvNil != pdoi; pdoi = pdoi->pdoiNext)
    {
        pdoiLast = pdoi;
        if (pdoi->cactRef == 0 && pdoi->lwThread == lwThread)
            cdoiLost++;
    }

    if (cdoiLost == 0)
    {
        // no lost blocks
        goto LDone;
    }

    stn.FFormatSz(PszLit("Total lost objects: %d. Press 'Debugger' for detail"), cdoiLost);
    stn.GetSzs(szs);
    fAssert = FAssertProc(__szsFile, __LINE__, szs, pvNil, 0);

    for (pdoi = pdoiLast;;)
    {
        pbase = _PbaseFromDoi(pdoi);
        AssertPo(pbase, fobjAllocated);

        if (pdoi->cactRef == 0 && pdoi->lwThread == lwThread)
        {
            if (fAssert)
            {
                stn.FFormatSz(PszLit("\nLost object: cls='%f', size=%d, ") PszLit("StackTrace=(use map file)"),
                              pbase->Cls(), pdoi->cbTot - SIZEOF(DOI));
                stn.GetSzs(szs);

                if (FAssertProc(pdoi->pszsFile, pdoi->lwLine, szs, pdoi->rglwStack, kclwStackDoi * SIZEOF(int32_t)))
                {
                    Debugger();
                }
            }

            MarkMemObj(pbase);
        }

        if (pdoi->ppdoiPrev == &_pdoiFirst)
            break;

        // UUUUGGGGH! We don't have a pointer to the previous DOI, we
        // have a pointer to the previous DOI's pdoiNext!
        pdoi = (DOI *)PvSubBv(pdoi->ppdoiPrev, offset(DOI, pdoiNext));
    }

LDone:
    _Leave();
}

/***************************************************************************
    Clears all marks on allocated (BASE) objects.
***************************************************************************/
void UnmarkAllObjs(void)
{
    _Enter();

    BASE *pbase;
    DOI *pdoi;
    int32_t lwThread = LwThreadCur();

    Assert(_pdoiFirstRaw == pvNil, "Raw list is not empty!");
    for (pdoi = _pdoiFirst; pvNil != pdoi; pdoi = pdoi->pdoiNext)
    {
        pbase = _PbaseFromDoi(pdoi);
        AssertPo(pbase, fobjAllocated);

        if (pdoi->lwThread == lwThread)
            pdoi->cactRef = 0;
    }

    _Leave();
}
#endif // DEBUG

/***************************************************************************
    Linked list element constructor
***************************************************************************/
BLL::BLL(void)
{
    _ppbllPrev = pvNil;
    _pbllNext = pvNil;
}

/***************************************************************************
    Remove the element from the linked list
***************************************************************************/
BLL::~BLL(void)
{
    // unlink the thing
    if (_ppbllPrev != pvNil)
        _Attach(pvNil);
}

/***************************************************************************
    Remove the element from the linked list (if it's in one) and reattach
    it at ppbllPrev (if not pvNil).
***************************************************************************/
void BLL::_Attach(void *ppbllPrev)
{
    AssertThis(0);
    PBLL *ppbll = (PBLL *)ppbllPrev;
    AssertNilOrVarMem(ppbll);

    // unlink the thing
    if (_ppbllPrev != pvNil)
    {
        Assert(*_ppbllPrev == this, "links corrupt");
        if ((*_ppbllPrev = _pbllNext) != pvNil)
        {
            Assert(_pbllNext->_ppbllPrev == &_pbllNext, "links corrupt 2");
            _pbllNext->_ppbllPrev = _ppbllPrev;
        }
    }

    // link the thing
    if ((_ppbllPrev = ppbll) == pvNil)
    {
        // not in a linked list
        _pbllNext = pvNil;
        return;
    }
    if ((_pbllNext = *ppbll) != pvNil)
    {
        Assert(_pbllNext->_ppbllPrev == ppbll, "links corrupt 3");
        _pbllNext->_ppbllPrev = &_pbllNext;
    }
    *ppbll = this;
}

#ifdef DEBUG
/***************************************************************************
    Check the links.
***************************************************************************/
void BLL::AssertValid(uint32_t grf)
{
    BLL_PAR::AssertValid(grf);

    if (_pbllNext != pvNil)
    {
        AssertVarMem(_pbllNext);
        Assert(_pbllNext->_ppbllPrev == &_pbllNext, "links corrupt");
    }
    if (_ppbllPrev != pvNil)
    {
        AssertVarMem(_ppbllPrev);
        Assert(*_ppbllPrev == this, "links corrupt 2");
    }
}
#endif // DEBUG
