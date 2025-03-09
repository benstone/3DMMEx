/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: Ben Stone
    Project: Kauai

    Graphical video object implementation stub.

***************************************************************************/
#include "frame.h"
ASSERTNAME

RTCLASS(GVID)
RTCLASS(GVDS)
RTCLASS(GVDW)

BEGIN_CMD_MAP_BASE(GVDS)
END_CMD_MAP(&GVDS::FCmdAll, pvNil, kgrfcmmAll)

const int32_t kcmhlGvds = kswMin; // put videos at the head of the list

PGVID GVID::PgvidNew(PFNI pfni, PGOB pgobBase, bool fHwndBased, int32_t hid)
{
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    if (fHwndBased)
        return GVDW::PgvdwNew(pfni, pgobBase, hid);
    return GVDS::PgvdsNew(pfni, pgobBase, hid);
}

GVID::GVID(int32_t hid) : GVID_PAR(hid)
{
    AssertBaseThis(0);
}

GVDS::GVDS(int32_t hid) : GVDS_PAR(hid)
{
    AssertBaseThis(0);
}

GVDS::~GVDS(void)
{
    AssertBaseThis(0);
}

bool GVDS::_FInit(PFNI pfni, PGOB pgobBase)
{
    AssertBaseThis(0);
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    // Not implemented: fail
    RawRtn();
    return fFalse;
}

PGVDS GVDS::PgvdsNew(PFNI pfni, PGOB pgobBase, int32_t hid)
{
    AssertPo(pfni, ffniFile);
    PGVDS pgvds;

    if (hid == hidNil)
        hid = CMH::HidUnique();

    if (pvNil == (pgvds = NewObj GVDS(hid)))
        return pvNil;

    if (!pgvds->_FInit(pfni, pgobBase))
    {
        ReleasePpo(&pgvds);
        return pvNil;
    }

    return pgvds;
}

int32_t GVDS::NfrMac(void)
{
    AssertThis(0);
    return _nfrMac;
}

int32_t GVDS::NfrCur(void)
{
    AssertThis(0);
    return _nfrCur;
}

void GVDS::GotoNfr(int32_t nfr)
{
    AssertThis(0);
    AssertIn(nfr, 0, _nfrMac);

    Stop();
    _nfrCur = nfr;
}

bool GVDS::FPlaying(void)
{
    AssertThis(0);
    return _fPlaying;
}

bool GVDS::FPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    Stop();
    if (!vpcex->FAddCmh(this, kcmhlGvds, kgrfcmmAll))
        return fFalse;

    SetRcPlay(prc);
    _fPlaying = fTrue;

    return fTrue;
}

void GVDS::SetRcPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    if (pvNil == prc)
        _rcPlay.Set(0, 0, _dxp, _dyp);
    else
        _rcPlay = *prc;
}

void GVDS::Stop(void)
{
    AssertThis(0);

    vpcex->RemoveCmh(this, kcmhlGvds);
    _fPlaying = fFalse;
}

bool GVDS::FCmdAll(PCMD pcmd)
{
    AssertThis(0);
    AssertVarMem(pcmd);

    if (!_fPlaying)
    {
        Stop();
        return fFalse;
    }

    // TODO: update _nfrCur
    _nfrCur = 0;

    if (_nfrCur != _nfrMarked)
    {
        _pgobBase->InvalRc(&_rcPlay, kginMark);
        _nfrMarked = _nfrCur;
    }
    if (_nfrCur >= _nfrMac - 1)
        Stop();

    return fFalse;
}

void GVDS::Draw(PGNV pgnv, RC *prc)
{
    AssertThis(0);
    AssertPo(pgnv, 0);
    AssertVarMem(prc);
    RC rc;
}

void GVDS::GetRc(RC *prc)
{
    AssertThis(0);
    AssertVarMem(prc);

    prc->Set(0, 0, _dxp, _dyp);
}

#ifdef DEBUG
void GVDS::AssertValid(uint32_t grf)
{
    GVDS_PAR::AssertValid(0);
    AssertPo(_pgobBase, 0);
    // REVIEW shonk: fill in GVDS::AssertValid
}
#endif // DEBUG

PGVDW GVDW::PgvdwNew(PFNI pfni, PGOB pgobBase, int32_t hid)
{
    AssertPo(pfni, ffniFile);
    PGVDW pgvdw;

    if (hid == hidNil)
        hid = CMH::HidUnique();

    if (pvNil == (pgvdw = NewObj GVDW(hid)))
        return pvNil;

    if (!pgvdw->_FInit(pfni, pgobBase))
    {
        ReleasePpo(&pgvdw);
        return pvNil;
    }

    return pgvdw;
}

GVDW::GVDW(int32_t hid) : GVDW_PAR(hid)
{
    AssertBaseThis(0);
}

GVDW::~GVDW(void)
{
    AssertBaseThis(0);
}

bool GVDW::_FInit(PFNI pfni, PGOB pgobBase)
{
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    _pgobBase = pgobBase;

    // TODO: Load video

    PushErc(ercCantOpenVideo);
    return fFalse;
}

int32_t GVDW::NfrMac(void)
{
    AssertThis(0);

    return _nfrMac;
}

int32_t GVDW::NfrCur(void)
{
    AssertThis(0);

    return 0;
}

void GVDW::GotoNfr(int32_t nfr)
{
    AssertThis(0);
    AssertIn(nfr, 0, _nfrMac);
}

bool GVDW::FPlaying(void)
{
    AssertThis(0);

    return _fPlaying;
}

bool GVDW::FPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    Stop();

    return fFalse;
}

void GVDW::SetRcPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    if (pvNil == prc)
        _rcPlay.Set(0, 0, _dxp, _dyp);
    else
        _rcPlay = *prc;
}

void GVDW::Stop(void)
{
    AssertThis(0);

    if (!_fPlaying)
        return;

    _fPlaying = fFalse;
}

void GVDW::Draw(PGNV pgnv, RC *prc)
{
    AssertThis(0);
    AssertPo(pgnv, 0);
    AssertVarMem(prc);

    _SetRc();
}

void GVDW::_SetRc(void)
{
    AssertThis(0);
    RC rcGob, rc;

    _pgobBase->GetRc(&rcGob, cooHwnd);
    rc = _rcPlay;
    rc.Offset(rcGob.xpLeft, rcGob.ypTop);
    if (_rc != rc || !_fVisible)
    {
        _rc = rc;
    }

    if (_cactPal != vcactRealize)
    {
        _cactPal = vcactRealize;
    }
}

void GVDW::GetRc(RC *prc)
{
    AssertThis(0);
    AssertVarMem(prc);

    prc->Set(0, 0, _dxp, _dyp);
}

#ifdef DEBUG
void GVDW::AssertValid(uint32_t grf)
{
    GVDW_PAR::AssertValid(0);
    Assert(_hwndMovie != hNil, 0);
    AssertPo(_pgobBase, 0);
}
#endif // DEBUG
