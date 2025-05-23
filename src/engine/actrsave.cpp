/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    actrsave.cpp: Actor load/save code

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

    Here's the chunk hierarchy:

    ACTR // contains an ACTF (origin, arid, nfrmFirst, tagTmpl...)
     |
     +---PATH (chid 0) // _pglxyz (actor path)
     |
     +---GGAE (chid 0) // _pggaev (actor events)


***************************************************************************/
#include "soc.h"
ASSERTNAME

const CHID kchidPath = 0;
const CHID kchidGgae = 0;

struct ACTF // Actor chunk on file
{
    int16_t bo;        // Byte order
    int16_t osk;       // OS kind
    XYZ dxyzFullRte;   // Translation of the route
    int32_t arid;      // Unique id assigned to this actor.
    int32_t nfrmFirst; // First frame in this actor's stage life
    int32_t nfrmLast;  // Last frame in this actor's stage life
    TAGF tagTmpl;      // Tag to actor's template
};
VERIFY_STRUCT_SIZE(ACTF, 44)
const BOM kbomActf = 0x5ffc0000 | kbomTag;

/***************************************************************************
    Deserialize all events in pggaev
***************************************************************************/
PGG DeserializeAEVs(int16_t bo, PGG pggaevf)
{
    AssertPo(pggaevf, 0);

    PGG pggaev;
    int32_t iaev;
    AEVCOSTF *paevcostf;
    AEVCOST aevcost;
    AEVSNDF *paevsndf;
    AEVSND aevsnd;

    pggaev = pggaevf->PggDup();
    if (pggaev == pvNil)
        return pvNil;

    for (iaev = 0; iaev < pggaev->IvMac(); iaev++)
    {
        if (kboOther == bo)
        {
            SwapBytesBom(pggaev->QvFixedGet(iaev), kbomAev);
        }

        switch (((AEV *)pggaev->QvFixedGet(iaev))->aet)
        {
        case aetCost:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevcost);
            }
            paevcostf = (AEVCOSTF *)pggaev->QvGet(iaev);

            aevcost.ibset = paevcostf->ibset;
            aevcost.cmid = paevcostf->cmid;
            aevcost.fCmtl = paevcostf->fCmtl;
            DeserializeTagfToTag(&paevcostf->tag, &aevcost.tag);

            pggaev->FPut(iaev, SIZEOF(AEVCOST), &aevcost);
            break;
        case aetSnd:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevsnd);
            }
            paevsndf = (AEVSNDF *)pggaev->QvGet(iaev);

            aevsnd.fLoop = paevsndf->fLoop;
            aevsnd.fQueue = paevsndf->fQueue;
            aevsnd.vlm = paevsndf->vlm;
            aevsnd.celn = paevsndf->celn;
            aevsnd.sty = paevsndf->sty;
            aevsnd.fNoSound = paevsndf->fNoSound;
            aevsnd.chid = paevsndf->chid;
            DeserializeTagfToTag(&paevsndf->tag, &aevsnd.tag);

            pggaev->FPut(iaev, SIZEOF(AEVSND), &aevsnd);
            break;
        case aetSize:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevsize);
            }
            break;
        case aetPull:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevpull);
            }
            break;
        case aetRotF:
        case aetRotH:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevrot);
            }
            break;
        case aetActn:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevactn);
            }
            break;
        case aetAdd:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevadd);
            }
            break;
        case aetFreeze:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevfreeze);
            }
            break;
        case aetMove:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevmove);
            }
            break;
        case aetTweak:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevtweak);
            }
            break;
        case aetStep:
            if (kboOther == bo)
            {
                SwapBytesBom(pggaev->QvGet(iaev), kbomAevstep);
            }
            break;
        case aetRem:
            // no var data
            break;
        default:
            Bug("Unknown AET");
            break;
        }
    }

    return pggaev;
}

/***************************************************************************
    Serialize all events in pggaev
***************************************************************************/
PGG SerializeAEVs(PGG pggaev)
{
    AssertPo(pggaev, 0);

    PGG pggaevf;
    int32_t iaev;
    AEVCOSTF aevcostf;
    AEVCOST *paevcost;
    AEVSNDF aevsndf;
    AEVSND *paevsnd;

    pggaevf = pggaev->PggDup();
    if (pggaevf == pvNil)
        return pvNil;

    for (iaev = 0; iaev < pggaevf->IvMac(); iaev++)
    {
        switch (((AEV *)pggaevf->QvFixedGet(iaev))->aet)
        {
        case aetCost:
            paevcost = (AEVCOST *)pggaevf->QvGet(iaev);

            aevcostf.ibset = paevcost->ibset;
            aevcostf.cmid = paevcost->cmid;
            aevcostf.fCmtl = paevcost->fCmtl;
            SerializeTagToTagf(&paevcost->tag, &aevcostf.tag);

            if (!pggaevf->FPut(iaev, SIZEOF(AEVCOSTF), &aevcostf))
                goto LFail;

            break;
        case aetSnd:
            paevsnd = (AEVSND *)pggaevf->QvGet(iaev);

            aevsndf.fLoop = paevsnd->fLoop;
            aevsndf.fQueue = paevsnd->fQueue;
            aevsndf.vlm = paevsnd->vlm;
            aevsndf.celn = paevsnd->celn;
            aevsndf.sty = paevsnd->sty;
            aevsndf.fNoSound = paevsnd->fNoSound;
            aevsndf.chid = paevsnd->chid;
            SerializeTagToTagf(&paevsnd->tag, &aevsndf.tag);

            if (!pggaevf->FPut(iaev, SIZEOF(AEVSNDF), &aevsndf))
                goto LFail;

            break;
        case aetSize:
        case aetPull:
        case aetRotF:
        case aetRotH:
        case aetActn:
        case aetAdd:
        case aetFreeze:
        case aetMove:
        case aetTweak:
        case aetStep:
        case aetRem:
            // no var data
            break;
        default:
            Bug("Unknown AET");
            break;
        }
    }

    return pggaevf;

LFail:
    ReleasePpo(&pggaevf);
    return pvNil;
}

/***************************************************************************
    Write the actor out to disk.  Store the root chunk in the given CNO.
    If this function returns false, it is the client's responsibility to
    delete the actor chunks.
***************************************************************************/
bool ACTR::FWrite(PCFL pcfl, CNO cnoActr, CNO cnoScene)
{
    AssertThis(0);
    AssertPo(pcfl, 0);

    ACTF actf;
    CNO cnoPath;
    CNO cnoGgae;
    CNO cnoTmpl;
    BLCK blck;
    KID kid;
    int32_t iaev;
    AEV *paev;
    AEVSND aevsnd;
    int32_t nfrmFirst;
    int32_t nfrmLast;
    PGG pggaev = pvNil;

    // Validate the actor's lifetime if not done already
    if (knfrmInvalid != _nfrmFirst)
    {
        if (!FGetLifetime(&nfrmFirst, &nfrmLast))
            return fFalse;
    }
#ifdef DEBUG
    if (knfrmInvalid == _nfrmFirst)
        Warn("Dev: Why are we saving an actor who has no first frame number?");
#endif // DEBUG

    // Save and adopt TMPL chunk if it's a ksidUseCrf chunk
    if (_tagTmpl.sid == ksidUseCrf)
    {
        Assert(_ptmpl->FIsTdt(), "only TDTs should be embedded in user doc");
        if (!pcfl->FFind(_tagTmpl.ctg, _tagTmpl.cno))
        {
            if (!((PTDT)_ptmpl)->FWrite(pcfl, _tagTmpl.ctg, &cnoTmpl))
                return fFalse;
            // Keep CNO the same
            pcfl->Move(_tagTmpl.ctg, cnoTmpl, _tagTmpl.ctg, _tagTmpl.cno);
        }

        if (tNo == pcfl->TIsDescendent(kctgActr, cnoActr, _tagTmpl.ctg, _tagTmpl.cno))
        {
            if (!pcfl->FAdoptChild(kctgActr, cnoActr, _tagTmpl.ctg,
                                   _tagTmpl.cno)) // clears loner bit
            {
                return fFalse;
            }
        }
    }

    // Write the ACTR chunk:
    actf.bo = kboCur;
    actf.osk = koskCur;
    actf.dxyzFullRte = _dxyzFullRte;
    actf.arid = _arid;
    actf.nfrmFirst = _nfrmFirst;
    actf.nfrmLast = _nfrmLast;
    SerializeTagToTagf(&_tagTmpl, &actf.tagTmpl);
    if (!pcfl->FPutPv(&actf, SIZEOF(ACTF), kctgActr, cnoActr))
        return fFalse;

    // Now write the PATH chunk:
    if (!pcfl->FAddChild(kctgActr, cnoActr, kchidPath, _pglrpt->CbOnFile(), kctgPath, &cnoPath, &blck))
    {
        return fFalse;
    }
    if (!_pglrpt->FWrite(&blck))
        return fFalse;

    // Now write the GGAE chunk:
    pggaev = SerializeAEVs(_pggaev);
    if (pggaev == pvNil)
        return fFalse;

    if (!pcfl->FAddChild(kctgActr, cnoActr, kchidGgae, pggaev->CbOnFile(), kctgGgae, &cnoGgae, &blck))
    {
        ReleasePpo(&pggaev);
        return fFalse;
    }
    if (!pggaev->FWrite(&blck))
    {
        ReleasePpo(&pggaev);
        return fFalse;
    }

    ReleasePpo(&pggaev);

    // Adopt actor sounds into the scene
    for (iaev = 0; iaev < _pggaev->IvMac(); iaev++)
    {
        paev = (AEV *)(_pggaev->QvFixedGet(iaev));
        if (aetSnd != paev->aet)
            continue;
        _pggaev->Get(iaev, &aevsnd);
        if (aevsnd.tag.sid != ksidUseCrf)
            continue;

        // For user sounds, the tag's cno must already be correct.
        // Moreover, FResolveSndTag can't succeed if the msnd chunk is
        // not yet a child of the current scene.

        // If the msnd chunk already exists as this chid of this scene, continue
        if (pcfl->FGetKidChidCtg(kctgScen, cnoScene, aevsnd.chid, kctgMsnd, &kid))
            continue;

        // If the msnd does not exist in this file, it exists in the main movie
        if (!pcfl->FFind(kctgMsnd, aevsnd.tag.cno))
            continue;

        // The msnd chunk has not been adopted into the scene as the specified chid
        if (!pcfl->FAdoptChild(kctgScen, cnoScene, kctgMsnd, aevsnd.tag.cno, aevsnd.chid))
        {
            return fFalse;
        }
    }

    return fTrue;
}

/***************************************************************************
    Read the actor data from disk, (re-)construct the actor, and return a
    pointer to it.
***************************************************************************/
PACTR ACTR::PactrRead(PCRF pcrf, CNO cnoActr)
{
    AssertPo(pcrf, 0);

    ACTR *pactr;
    KID kid;
    PCFL pcfl = pcrf->Pcfl();

    pactr = NewObj ACTR;
    if (pvNil == pactr)
        goto LFail;
    if (!pactr->_FReadActor(pcfl, cnoActr))
        goto LFail;
    if (!pcfl->FGetKidChidCtg(kctgActr, cnoActr, kchidPath, kctgPath, &kid))
        goto LFail;
    if (!pactr->_FReadRoute(pcfl, kid.cki.cno))
        goto LFail;
    if (!pcfl->FGetKidChidCtg(kctgActr, cnoActr, kchidGgae, kctgGgae, &kid))
        goto LFail;
    if (!pactr->_FReadEvents(pcfl, kid.cki.cno))
        goto LFail;
    if (!pactr->_FOpenTags(pcrf))
        goto LFail;
    if (pvNil == (pactr->_pglsmm = GL::PglNew(SIZEOF(SMM), kcsmmGrow)))
        goto LFail;
    pactr->_pglsmm->SetMinGrow(kcsmmGrow);

    // Now that the tags are open, fetch the TMPL
    pactr->_ptmpl = (PTMPL)vptagm->PbacoFetch(&pactr->_tagTmpl, TMPL::FReadTmpl);
    if (pvNil == pactr->_ptmpl)
        goto LFail;

    if (knfrmInvalid == pactr->_nfrmLast && knfrmInvalid != pactr->_nfrmFirst)
    {
        int32_t nfrmFirst, nfrmLast;

        if (!pactr->FGetLifetime(&nfrmFirst, &nfrmLast))
            goto LFail;
    }

    AssertPo(pactr, 0);
    return pactr;
LFail:
    Warn("PactrRead failed");
    ReleasePpo(&pactr);
    return pvNil;
}

/***************************************************************************
    Read the ACTF. This handles converting an ACTF that doesn't have an
    nfrmLast.
***************************************************************************/
bool _FReadActf(PBLCK pblck, ACTF *pactf)
{
    AssertPo(pblck, 0);
    AssertVarMem(pactf);
    bool fOldActf = fFalse;

    if (!pblck->FUnpackData())
        return fFalse;

    if (pblck->Cb() != SIZEOF(ACTF))
    {
        if (pblck->Cb() != SIZEOF(ACTF) - SIZEOF(int32_t))
            return fFalse;
        fOldActf = fTrue;
    }

    if (!pblck->FReadRgb(pactf, pblck->Cb(), 0))
        return fFalse;

    if (fOldActf)
    {
        BltPb(&pactf->nfrmLast, &pactf->nfrmLast + 1, SIZEOF(ACTF) - offset(ACTF, nfrmLast) - SIZEOF(int32_t));
    }

    if (kboOther == pactf->bo)
        SwapBytesBom(pactf, kbomActf);
    if (kboCur != pactf->bo)
    {
        Bug("Corrupt ACTF");
        return fFalse;
    }

    if (fOldActf)
        pactf->nfrmLast = knfrmInvalid;
    return fTrue;
}

/***************************************************************************
    Read the ACTR chunk
***************************************************************************/
bool ACTR::_FReadActor(PCFL pcfl, CNO cno)
{
    AssertBaseThis(0);
    AssertPo(pcfl, 0);

    ACTF actf;
    BLCK blck;

    if (!pcfl->FFind(kctgActr, cno, &blck) || !_FReadActf(&blck, &actf))
        return fFalse;

    Assert(kboCur == actf.bo, "bad ACTF");
    _dxyzFullRte = actf.dxyzFullRte;
    _arid = actf.arid;
    _nfrmFirst = actf.nfrmFirst;
    _nfrmLast = actf.nfrmLast;
    DeserializeTagfToTag(&actf.tagTmpl, &_tagTmpl);
    _fLifeDirty = (knfrmInvalid == _nfrmFirst) || (knfrmInvalid == _nfrmLast);

    if (_tagTmpl.sid == ksidUseCrf)
    {
        // Actor is a TDT.  Tag might be wrong if this actor was imported,
        // so look for child TMPL.
        KID kid;

        if (!pcfl->FGetKidChidCtg(kctgActr, cno, 0, kctgTmpl, &kid))
        {
            Bug("where's the child TMPL?");
            return fTrue; // hope the tag is correct
        }
        _tagTmpl.cno = kid.cki.cno;
    }

    return fTrue;
}

/******************************************************************************
    FAdjustAridOnFile
        Given a chunky file, a CNO and a delta for the arid, updates the
        arid for the actor on file.

    Arguments:
        PCFL pcfl   -- the file the actor's on
        CNO cno     -- the CNO of the actor
        long darid  -- the change of the arid

    Returns: fTrue if everything went well, fFalse otherwise

************************************************************ PETED ***********/
bool ACTR::FAdjustAridOnFile(PCFL pcfl, CNO cno, int32_t darid)
{
    AssertPo(pcfl, 0);
    Assert(darid != 0, "Why call this with darid == 0?");

    ACTF actf;
    BLCK blck;

    if (!pcfl->FFind(kctgActr, cno, &blck) || !_FReadActf(&blck, &actf))
        return fFalse;

    Assert(kboCur == actf.bo, "bad ACTF");
    actf.arid += darid;
    return pcfl->FPutPv(&actf, SIZEOF(ACTF), kctgActr, cno);
}

/***************************************************************************
    Read the PATH (_pglrpt) chunk
***************************************************************************/
bool ACTR::_FReadRoute(PCFL pcfl, CNO cno)
{
    AssertBaseThis(0);
    AssertPo(pcfl, 0);

    BLCK blck;
    int16_t bo;

    if (!pcfl->FFind(kctgPath, cno, &blck))
        return fFalse;
    _pglrpt = GL::PglRead(&blck, &bo);
    if (pvNil == _pglrpt)
        return fFalse;
    AssertBomRglw(kbomRpt, SIZEOF(RPT));
    if (kboOther == bo)
    {
        SwapBytesRglw(_pglrpt->QvGet(0), LwMul(_pglrpt->IvMac(), SIZEOF(RPT) / SIZEOF(int32_t)));
    }
    return fTrue;
}

/***************************************************************************
    Read the GGAE (_pggaev) chunk
***************************************************************************/
bool ACTR::_FReadEvents(PCFL pcfl, CNO cno)
{
    AssertBaseThis(0);
    AssertPo(pcfl, 0);

    BLCK blck;
    int16_t bo;
    PGG pggaevf;

    if (!pcfl->FFind(kctgGgae, cno, &blck))
        return fFalse;
    pggaevf = GG::PggRead(&blck, &bo);
    if (pvNil == pggaevf)
        return fFalse;
    _pggaev = DeserializeAEVs(bo, pggaevf);
    ReleasePpo(&pggaevf);
    return fTrue;
}

/***************************************************************************
    Open all tags for this actor
***************************************************************************/
bool ACTR::_FOpenTags(PCRF pcrf)
{
    AssertBaseThis(0);
    AssertPo(pcrf, 0);

    int32_t iaev = 0;
    PTAG ptag;

    if (!TAGM::FOpenTag(&_tagTmpl, pcrf))
        goto LFail;

    _pggaev->Lock();
    for (iaev = 0; iaev < _pggaev->IvMac(); iaev++)
    {
        if (_FIsIaevTag(_pggaev, iaev, &ptag))
        {
            if (!TAGM::FOpenTag(ptag, pcrf))
                goto LFail;
        }
    }
    _pggaev->Unlock();
    return fTrue;
LFail:
    // Close the tags that were opened before failure
    while (--iaev >= 0)
    {
        if (_FIsIaevTag(_pggaev, iaev, &ptag))
            TAGM::CloseTag(ptag);
    }
    _pggaev->Unlock();
    return fFalse;
}

/***************************************************************************
    Close all tags in this actor's event stream
***************************************************************************/
void ACTR::_CloseTags(void)
{
    AssertBaseThis(0); // because destructor calls this function

    int32_t iaev;
    PTAG ptag;

    TAGM::CloseTag(&_tagTmpl);

    if (pvNil == _pggaev)
        return;

    _pggaev->Lock();
    for (iaev = 0; iaev < _pggaev->IvMac(); iaev++)
    {
        if (_FIsIaevTag(_pggaev, iaev, &ptag))
            TAGM::CloseTag(ptag);
    }
    _pggaev->Unlock();
    return;
}

/***************************************************************************
    Get all the tags that the actor uses
***************************************************************************/
PGL ACTR::PgltagFetch(PCFL pcfl, CNO cno, bool *pfError)
{
    AssertPo(pcfl, 0);
    AssertVarMem(pfError);

    ACTF actf;
    BLCK blck;
    int16_t bo;
    TAG tag;
    PTAG ptag;
    PGL pgltag;
    PGG pggaev = pvNil;
    PGG pggaevf = pvNil;
    int32_t iaev;
    KID kid;

    pgltag = GL::PglNew(SIZEOF(TAG), 0);
    if (pvNil == pgltag)
        goto LFail;

    // Read the ACTF so we can insert tagTmpl:
    if (!pcfl->FFind(kctgActr, cno, &blck) || !_FReadActf(&blck, &actf))
        goto LFail;

    if (actf.tagTmpl.sid == ksidUseCrf)
    {
        PGL pgltagTmpl;

        // Actor is a TDT.  Tag might be wrong if this actor was imported,
        // so look for child TMPL.
        if (pcfl->FGetKidChidCtg(kctgActr, cno, 0, kctgTmpl, &kid))
        {
            actf.tagTmpl.cno = kid.cki.cno;
        }
        else
        {
            Bug("where's the child TMPL?");
        }

        pgltagTmpl = TMPL::PgltagFetch(pcfl, actf.tagTmpl.ctg, actf.tagTmpl.cno, pfError);
        if (*pfError)
        {
            ReleasePpo(&pgltagTmpl);
            goto LFail;
        }
        if (pvNil != pgltagTmpl)
        {
            int32_t itag;

            for (itag = 0; itag < pgltagTmpl->IvMac(); itag++)
            {
                pgltagTmpl->Get(itag, &tag);
                if (!pgltag->FAdd(&tag))
                {
                    ReleasePpo(&pgltagTmpl);
                    goto LFail;
                }
            }
            ReleasePpo(&pgltagTmpl);
        }
    }

    DeserializeTagfToTag(&actf.tagTmpl, &tag);
    if (!pgltag->FInsert(0, &tag))
        goto LFail;

    // Pull all tags out of the event list:
    if (!pcfl->FGetKidChidCtg(kctgActr, cno, kchidGgae, kctgGgae, &kid))
        goto LFail;
    if (!pcfl->FFind(kctgGgae, kid.cki.cno, &blck))
        goto LFail;
    pggaevf = GG::PggRead(&blck, &bo);
    if (pvNil == pggaevf)
        goto LFail;
    pggaev = DeserializeAEVs(bo, pggaevf);
    pggaev->Lock();
    for (iaev = 0; iaev < pggaev->IvMac(); iaev++)
    {
        if (_FIsIaevTag(pggaev, iaev, &ptag))
        {
            if (!pgltag->FAdd(ptag))
            {
                pggaev->Unlock();
                goto LFail;
            }
        }
    }
    pggaev->Unlock();
    *pfError = fFalse;
    ReleasePpo(&pggaev);
    ReleasePpo(&pggaevf);
    return pgltag;
LFail:
    *pfError = fTrue;
    ReleasePpo(&pgltag);
    ReleasePpo(&pggaev);
    ReleasePpo(&pggaevf);
    return pvNil;
}

/***************************************************************************
    If the iaev'th event of pggaev has a tag, sets *pptag to point to it.
    WARNING: unless you locked pggaev, *pptag is a qtag!
***************************************************************************/
bool ACTR::_FIsIaevTag(PGG pggaev, int32_t iaev, PTAG *pptag, PAEV *pqaev)
{
    AssertPo(pggaev, 0);
    AssertIn(iaev, 0, pggaev->IvMac());
    AssertVarMem(pptag);
    AssertNilOrVarMem(pqaev);

    AEV *qaev;
    qaev = (AEV *)pggaev->QvFixedGet(iaev);
    if (pqaev != pvNil)
        *pqaev = qaev;

    switch (qaev->aet)
    {
    case aetCost:
        if (!((AEVCOST *)pggaev->QvGet(iaev))->fCmtl)
        {
            *pptag = &((AEVCOST *)pggaev->QvGet(iaev))->tag;
            return fTrue;
        }
        break;
    case aetSnd:
        *pptag = &((AEVSND *)pggaev->QvGet(iaev))->tag;
        return fTrue;
    case aetSize:
    case aetPull:
    case aetRotF:
    case aetRotH:
    case aetActn:
    case aetAdd:
    case aetFreeze:
    case aetTweak:
    case aetStep:
    case aetRem:
    case aetMove:
        break;
    default:
        Bug("Unknown AET");
        break;
    }
    *pptag = pvNil;
    return fFalse;
}
