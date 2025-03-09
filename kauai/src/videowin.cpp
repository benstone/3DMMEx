/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Copyright (c) Microsoft Corporation

    Graphical video object implementation.

***************************************************************************/
#include "frame.h"
#ifdef WIN
#include "mciavi.h"
#endif // WIN
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

#ifdef WIN
    AVIFileInit();
#endif // WIN
}

GVDS::~GVDS(void)
{
    AssertBaseThis(0);

#ifdef WIN
    if (hNil != _hdd)
        DrawDibClose(_hdd);
    if (pvNil != _pavig)
        AVIStreamGetFrameClose(_pavig);
    if (pvNil != _pavis)
        AVIStreamRelease(_pavis);
    if (pvNil != _pavif)
        AVIFileRelease(_pavif);

    AVIFileExit();
#endif // WIN
}

bool GVDS::_FInit(PFNI pfni, PGOB pgobBase)
{
    AssertBaseThis(0);
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

#ifdef WIN
    STN stn;
    AVIFILEINFO afi;

    _pgobBase = pgobBase;
    pfni->GetStnPath(&stn);
    if (0 != AVIFileOpen(&_pavif, stn.Psz(), OF_READ | OF_SHARE_DENY_WRITE, pvNil))
    {
        _pavif = pvNil;
        goto LFail;
    }

    if (0 != AVIFileGetStream(_pavif, &_pavis, streamtypeVIDEO, 0))
    {
        _pavis = pvNil;
        goto LFail;
    }

    if (pvNil == (_pavig = AVIStreamGetFrameOpen(_pavis, pvNil)))
        goto LFail;

    if (0 != AVIFileInfo(_pavif, &afi, SIZEOF(afi)))
        goto LFail;

    _dxp = afi.dwWidth;
    _dyp = afi.dwHeight;

    if (0 > (_nfrMac = AVIStreamLength(_pavis)))
        goto LFail;

    if (0 > (_dnfr = AVIStreamStart(_pavis)))
        goto LFail;

    if (hNil == (_hdd = DrawDibOpen()))
    {
    LFail:
        PushErc(ercCantOpenVideo);
        return fFalse;
    }
    _nfrCur = 0;
    _nfrMarked = -1;
    return fTrue;
#else  //! WIN
    RawRtn();
    return fFalse;
#endif //! WIN
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

#ifdef WIN
    _tsPlay = TsCurrent() - AVIStreamSampleToTime(_pavis, _nfrCur + _dnfr);
#endif // WIN

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

    // update _nfrCur
#ifdef WIN
    _nfrCur = AVIStreamTimeToSample(_pavis, TsCurrent() - _tsPlay) - _dnfr;
    if (_nfrCur >= _nfrMac)
        _nfrCur = _nfrMac - 1;
    else if (_nfrCur < 0)
        _nfrCur = 0;
#endif // WIN

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

#ifdef WIN
    BITMAPINFOHEADER *pbi;

    if (pvNil == (pbi = (BITMAPINFOHEADER *)AVIStreamGetFrame(_pavig, _nfrCur + _dnfr)))
    {
        return;
    }

    pgnv->DrawDib(_hdd, pbi, prc);
#endif // WIN
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

#ifdef WIN
    if (_fDeviceOpen)
    {
        MCI_GENERIC_PARMS mci;
        PSNDV psndv;

        mciSendCommand(_lwDevice, MCI_CLOSE, MCI_WAIT, (DWORD_PTR)&mci);
        if (pvNil != vpsndm && pvNil != (psndv = vpsndm->PsndvFromCtg(kctgWave)))
        {
            psndv->Suspend(fFalse);
        }
    }
#endif // WIN
}

bool GVDW::_FInit(PFNI pfni, PGOB pgobBase)
{
    AssertPo(pfni, ffniFile);
    AssertPo(pgobBase, 0);

    _pgobBase = pgobBase;

#ifdef WIN
    MCI_ANIM_OPEN_PARMS mciOpen;
    MCI_STATUS_PARMS mciStatus;
    MCI_ANIM_RECT_PARMS mciRect;
    STN stn;
    PSNDV psndv;

    pfni->GetStnPath(&stn);

    ClearPb(&mciOpen, SIZEOF(mciOpen));
    mciOpen.lpstrDeviceType = PszLit("avivideo");
    mciOpen.lpstrElementName = stn.Psz();
    mciOpen.dwStyle = WS_CHILD | WS_CLIPSIBLINGS | WS_DISABLED;
    mciOpen.hWndParent = _pgobBase->HwndContainer();
    if (0 != mciSendCommand(0, MCI_OPEN, MCI_OPEN_TYPE | MCI_OPEN_ELEMENT | MCI_ANIM_OPEN_PARENT | MCI_ANIM_OPEN_WS,
                            (DWORD_PTR)&mciOpen))
    {
        goto LFail;
    }
    _lwDevice = mciOpen.wDeviceID;
    _fDeviceOpen = fTrue;
    if (pvNil != vpsndm && pvNil != (psndv = vpsndm->PsndvFromCtg(kctgWave)))
    {
        psndv->Suspend(fTrue);
    }

    // get the hwnd
    ClearPb(&mciStatus, SIZEOF(mciStatus));
    // REVIEW shonk: mmsystem.h defines MCI_ANIM_STATUS_HWND as 0x00004003,
    // which doesn't give us the hwnd. 4001 does!
    mciStatus.dwItem = 0x00004001;
    if (0 != mciSendCommand(_lwDevice, MCI_STATUS, MCI_STATUS_ITEM, (DWORD_PTR)&mciStatus))
    {
        goto LFail;
    }
    _hwndMovie = (HWND)mciStatus.dwReturn;

    // get the length
    ClearPb(&mciStatus, SIZEOF(mciStatus));
    mciStatus.dwItem = MCI_STATUS_LENGTH;
    mciStatus.dwTrack = 1;
    if (0 != mciSendCommand(_lwDevice, MCI_STATUS, MCI_STATUS_ITEM, (DWORD_PTR)&mciStatus))
    {
        goto LFail;
    }
    _nfrMac = mciStatus.dwReturn;

    // get the rectangle
    if (0 != mciSendCommand(_lwDevice, MCI_WHERE, MCI_ANIM_WHERE_SOURCE, (DWORD_PTR)&mciRect))
    {
        goto LFail;
    }
    _rcPlay = (RC)mciRect.rc;
    _dxp = _rcPlay.Dxp();
    _dyp = _rcPlay.Dyp();

    mciSendCommand(_lwDevice, MCI_REALIZE, MCI_ANIM_REALIZE_BKGD, 0);
    _cactPal = vcactRealize;

    return fTrue;

LFail:
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::_FInit
#endif        // MAC

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

#ifdef WIN
    MCI_STATUS_PARMS mciStatus;

    // get the position
    ClearPb(&mciStatus, SIZEOF(mciStatus));
    mciStatus.dwItem = MCI_STATUS_POSITION;
    mciStatus.dwTrack = 1;
    if (0 != mciSendCommand(_lwDevice, MCI_STATUS, MCI_STATUS_ITEM, (DWORD_PTR)&mciStatus))
    {
        Warn("getting position failed");
        return 0;
    }
    return mciStatus.dwReturn;
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::NfrCur
    return 0;
#endif // MAC
}

void GVDW::GotoNfr(int32_t nfr)
{
    AssertThis(0);
    AssertIn(nfr, 0, _nfrMac);

#ifdef WIN
    MCI_SEEK_PARMS mciSeek;

    ClearPb(&mciSeek, SIZEOF(mciSeek));
    mciSeek.dwTo = nfr;
    if (0 != mciSendCommand(_lwDevice, MCI_SEEK, MCI_TO, (DWORD_PTR)&mciSeek))
    {
        Warn("seeking failed");
    }
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::GotoNfr
#endif        // MAC
}

bool GVDW::FPlaying(void)
{
    AssertThis(0);

    if (!_fPlaying)
        return fFalse;

#ifdef WIN
    MCI_STATUS_PARMS mciStatus;

    // get the mode
    ClearPb(&mciStatus, SIZEOF(mciStatus));
    mciStatus.dwItem = MCI_STATUS_MODE;
    mciStatus.dwTrack = 1;
    if (0 == mciSendCommand(_lwDevice, MCI_STATUS, MCI_STATUS_ITEM, (DWORD_PTR)&mciStatus) &&
        (MCI_MODE_STOP == mciStatus.dwReturn || MCI_MODE_PAUSE == mciStatus.dwReturn))
    {
        _fPlaying = fFalse;
    }
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::NfrCur
#endif        // MAC

    return _fPlaying;
}

bool GVDW::FPlay(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    Stop();

#ifdef WIN
    MCI_ANIM_PLAY_PARMS mciPlay;

    // get the play rectangle
    SetRcPlay(prc);

    // position the hwnd
    _SetRc();

    // start the movie playing
    ClearPb(&mciPlay, SIZEOF(mciPlay));
    if (0 != mciSendCommand(_lwDevice, MCI_PLAY, MCI_MCIAVI_PLAY_WINDOW, (DWORD_PTR)&mciPlay))
    {
        return fFalse;
    }
    _fPlaying = fTrue;

    return fTrue;
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::NfrCur
    return fFalse;
#endif // MAC
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

#ifdef WIN
    MCI_GENERIC_PARMS mciPause;

    ClearPb(&mciPause, SIZEOF(mciPause));
    mciSendCommand(_lwDevice, MCI_PAUSE, 0, (DWORD_PTR)&mciPause);
#endif // WIN

#ifdef MAC
    RawRtn(); // REVIEW shonk: Mac: implement GVDW::Stop
#endif        // MAC
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
#ifdef WIN
        MoveWindow(_hwndMovie, rc.xpLeft, rc.ypTop, rc.Dxp(), rc.Dyp(), fTrue);
        if (!_fVisible)
        {
            MCI_ANIM_WINDOW_PARMS mciWindow;

            // show the playback window
            ClearPb(&mciWindow, SIZEOF(mciWindow));
            mciWindow.nCmdShow = SW_SHOW;
            mciSendCommand(_lwDevice, MCI_WINDOW, MCI_ANIM_WINDOW_STATE, (DWORD_PTR)&mciWindow);
            _fVisible = fTrue;
        }
#endif // WIN

#ifdef MAC
        RawRtn(); // REVIEW shonk: Mac: implement GVDW::_SetRc
#endif            // MAC
        _rc = rc;
    }

    if (_cactPal != vcactRealize)
    {
#ifdef WIN
        mciSendCommand(_lwDevice, MCI_REALIZE, MCI_ANIM_REALIZE_BKGD, 0);
#endif // WIN
#ifdef MAC
        RawRtn(); // REVIEW shonk: Mac: implement GVDW::_SetRc
#endif            // MAC
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
