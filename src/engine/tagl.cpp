/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    tagl.cpp: Tag list class

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

    The GG of TAGFs is maintained in sorted order.  It is sorted by sid,
    then by	CTG, then by CNO.

***************************************************************************/
#include "soc.h"
ASSERTNAME

RTCLASS(TAGL)

/****************************************
    TAGF, or "tag-flag" struct, stores
    the tag that you want to cache and
    whether to cache its children
    automatically or not.
****************************************/
struct TAGF
{
    TAG tag;
    bool fCacheChildren;
};

/****************************************
    CC, or "chid-ctg" struct, for
    children of a tag.  An array of
    these is the variable part of the
    GG.
****************************************/
struct CC
{
    CHID chid;
    CTG ctg;
};

/***************************************************************************
    Create a new TAGL
***************************************************************************/
PTAGL TAGL::PtaglNew(void)
{
    PTAGL ptagl;

    ptagl = NewObj TAGL;
    if (pvNil == ptagl)
        return pvNil;
    if (!ptagl->_FInit())
    {
        ReleasePpo(&ptagl);
        return pvNil;
    }
    AssertPo(ptagl, 0);
    return ptagl;
}

/***************************************************************************
    Initialize the TAGL
***************************************************************************/
bool TAGL::_FInit(void)
{
    AssertBaseThis(0);

    _pggtagf = GG::PggNew(SIZEOF(TAGF));
    if (pvNil == _pggtagf)
        return fFalse;
    return fTrue;
}

/***************************************************************************
    Clean up and delete this tag list
***************************************************************************/
TAGL::~TAGL(void)
{
    AssertBaseThis(0);
    ReleasePpo(&_pggtagf);
}

/***************************************************************************
    Return the count of tags in the TAGL
***************************************************************************/
int32_t TAGL::Ctag(void)
{
    AssertThis(0);

    return _pggtagf->IvMac();
}

/***************************************************************************
    Get the itag'th tag from the TAGL
***************************************************************************/
void TAGL::GetTag(int32_t itag, PTAG ptag)
{
    AssertThis(0);
    AssertIn(itag, 0, Ctag());
    AssertVarMem(ptag);

    TAGF tagf;

    _pggtagf->GetFixed(itag, &tagf);
    *ptag = tagf.tag;
}

/***************************************************************************
    Find ptag in the TAGL.  If the tag is found, the function returns
    fTrue and *pitag is the location of the tag in the GG.  If the tag
    is not found, the function returns fFalse and *pitag is the location
    at which the tag should be inserted into the GG to maintain correct
    sorting order in the GG.
***************************************************************************/
bool TAGL::_FFindTag(PTAG ptag, int32_t *pitag)
{
    AssertThis(0);
    AssertVarMem(ptag);
    AssertVarMem(pitag);

    TAGF *qtagf;
    int32_t itagfMin, itagfLim, itagf;
    int32_t sid = ptag->sid;
    CTG ctg = ptag->ctg;
    CNO cno = ptag->cno;

    if (_pggtagf->IvMac() == 0)
    {
        *pitag = 0;
        return fFalse;
    }

    // Do a binary search.  The TAGFs are sorted by (sid, ctg, cno).
    for (itagfMin = 0, itagfLim = _pggtagf->IvMac(); itagfMin < itagfLim;)
    {
        itagf = (itagfMin + itagfLim) / 2;
        qtagf = (TAGF *)_pggtagf->QvFixedGet(itagf);
        if (sid < qtagf->tag.sid)
            itagfLim = itagf;
        else if (sid > qtagf->tag.sid)
            itagfMin = itagf + 1;
        else if (ctg < qtagf->tag.ctg)
            itagfLim = itagf;
        else if (ctg > qtagf->tag.ctg)
            itagfMin = itagf + 1;
        else if (cno < qtagf->tag.cno)
            itagfLim = itagf;
        else if (cno > qtagf->tag.cno)
            itagfMin = itagf + 1;
        else
        {
            *pitag = itagf;
            return fTrue;
        }
    }

    // Tag not found
    *pitag = itagfMin;
    return fFalse;
}

/***************************************************************************
    Insert the given tag into the TAGL, if it isn't already in there.
***************************************************************************/
bool TAGL::FInsertTag(PTAG ptag, bool fCacheChildren)
{
    AssertThis(0);
    AssertVarMem(ptag);

    int32_t itag;
    TAGF tagf;

    if (!_FFindTag(ptag, &itag))
    {
        // Build and insert TAGF into fixed part of GG
        tagf.tag = *ptag;
        tagf.fCacheChildren = fCacheChildren;
        if (!_pggtagf->FInsert(itag, 0, pvNil, &tagf))
            return fFalse;
        return fTrue;
    }
    // Tag is already in GG, see if fCacheChildren needs to be updated
    _pggtagf->GetFixed(itag, &tagf);
    if (!tagf.fCacheChildren && fCacheChildren)
    {
        // FIXME(bruxisma): The compiler has correctly identified that this
        // should be an assignment.
        tagf.fCacheChildren == fTrue;
        _pggtagf->PutFixed(itag, &tagf);
    }
    return fTrue;
}

/***************************************************************************
    Insert a TAG child into the TAGL
***************************************************************************/
bool TAGL::FInsertChild(PTAG ptag, CHID chid, CTG ctg)
{
    AssertThis(0);
    AssertVarMem(ptag);

    int32_t itagf;
    CC ccNew;
    CC *prgcc;
    int32_t ccc; // count of CCs
    int32_t icc;

    if (!_FFindTag(ptag, &itagf))
    {
        Bug("You should have inserted ptag first");
        return fFalse;
    }
#ifdef DEBUG
    TAGF tagf;
    _pggtagf->GetFixed(itagf, &tagf);
    if (tagf.tag.ctg != ptag->ctg || tagf.tag.cno != ptag->cno)
        Bug("_FFindTag has a bug");
#endif // DEBUG

    ccNew.chid = chid;
    ccNew.ctg = ctg;
    ccc = _pggtagf->Cb(itagf) / SIZEOF(CC);
    if (ccc == 0)
    {
        if (!_pggtagf->FPut(itagf, SIZEOF(CC), &ccNew))
            return fFalse;
        return fTrue;
    }
    prgcc = (CC *)_pggtagf->QvGet(itagf);
    // linear search through prgcc to find where to insert ccNew
    for (icc = 0; icc < ccc; icc++)
    {
        if (prgcc[icc].ctg > ccNew.ctg)
            break;
        if (prgcc[icc].ctg == ccNew.ctg && prgcc[icc].chid > ccNew.chid)
            break;
    }
    if (!_pggtagf->FInsertRgb(itagf, icc * SIZEOF(CC), SIZEOF(CC), &ccNew))
        return fFalse;
    return fTrue;
}

/***************************************************************************
    Cache all the tags and child tags in TAGL
***************************************************************************/
bool TAGL::FCacheTags(void)
{
    AssertThis(0);

    int32_t itagf;
    TAGF tagf;
    int32_t ccc; // count of CCs
    int32_t icc;
    CC cc;
    TAG tag;

    for (itagf = 0; itagf < _pggtagf->IvMac(); itagf++)
    {
        // Cache the main tag
        _pggtagf->GetFixed(itagf, &tagf);
        if (!vptagm->FCacheTagToHD(&tagf.tag, tagf.fCacheChildren))
            return fFalse;

        // Cache the child tags
        ccc = _pggtagf->Cb(itagf) / SIZEOF(CC);
        for (icc = 0; icc < ccc; icc++)
        {
            _pggtagf->GetRgb(itagf, icc * SIZEOF(CC), SIZEOF(CC), &cc);
            if (!vptagm->FBuildChildTag(&tagf.tag, cc.chid, cc.ctg, &tag))
                return fFalse;
            // Note that if we ever have the case where we don't always
            // want the CC tag to be cached with all its children, we could
            // change the CC structure to hold a boolean and pass it to
            // FCacheTagToHD here.
            if (!vptagm->FCacheTagToHD(&tag, fTrue))
                return fFalse;
        }
    }
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of the TAGL.
***************************************************************************/
void TAGL::AssertValid(uint32_t grf)
{
    TAGL_PAR::AssertValid(fobjAllocated);
    AssertPo(_pggtagf, 0);
}

/***************************************************************************
    Mark memory used by the TAGL
***************************************************************************/
void TAGL::MarkMem(void)
{
    AssertThis(0);
    TAGL_PAR::MarkMem();
    MarkMemObj(_pggtagf);
}
#endif // DEBUG
