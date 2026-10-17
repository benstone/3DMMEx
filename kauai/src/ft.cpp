/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai test app
    Reviewed:
    Copyright (c) Microsoft Corporation

    Frame tester.

***************************************************************************/
#include "frame.h"
#include "ftres.h"
ASSERTNAME

#ifdef DEBUG
void CheckForLostMem(BASE *po);
#else //! DEBUG
#define CheckForLostMem(po)
#endif //! DEBUG

void TestUtil(void);
int32_t _LwSqrt(int32_t lw);

#define APP_PAR APPB
#define kclsAPP KLCONST3('A', 'P', 'P')
class APP : public APP_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(APP)

  protected:
    virtual bool _FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef) override;

  public:
    virtual void GetStnAppName(PSTN pstn) override;
    bool FCmdTestSuite(PCMD pcmd);
    bool FCmdNewTestWnd(PCMD pcmd);
    bool FCmdTextTestWnd(PCMD pcmd);
    bool FCmdTimeTestRc(PCMD pcmd);
    bool FCmdMacro(PCMD pcmd);

    bool FCmdTestPerspective(PCMD pcmd);
    bool FCmdTestPictures(PCMD pcmd);
    bool FCmdTestMbmps(PCMD pcmd);
    bool FCmdFastUpdate(PCMD pcmd);
    bool FCmdTextEdit(PCMD pcmd);
#ifdef WIN
    bool FCmdTestFni(PCMD pcmd);
#endif // WIN
#ifdef MAC
    bool FCmdSetScreen(PCMD pcmd);
    bool FEnableScreen(PCMD pcmd, uint32_t *pgrfeds);
#endif // MAC
    bool FEnableMacro(PCMD pcmd, uint32_t *pgrfeds);
};

BEGIN_CMD_MAP(APP, APPB)
ON_CID_GEN(cidTestSuite, &APP::FCmdTestSuite, pvNil)
ON_CID_GEN(cidNewTestWnd, &APP::FCmdNewTestWnd, pvNil)
ON_CID_GEN(cidTextTestWnd, &APP::FCmdTextTestWnd, pvNil)
ON_CID_GEN(cidTimeFrameRc, &APP::FCmdTimeTestRc, pvNil)
ON_CID_GEN(cidTestPerspective, &APP::FCmdTestPerspective, pvNil)
ON_CID_GEN(cidTestPictures, &APP::FCmdTestPictures, pvNil)
ON_CID_GEN(cidTestMbmps, &APP::FCmdTestMbmps, pvNil)
ON_CID_GEN(cidTestFastUpdate, &APP::FCmdFastUpdate, pvNil)
ON_CID_GEN(cidTestTextEdit, &APP::FCmdTextEdit, pvNil)
ON_CID_GEN(cidStartRecording, &APP::FCmdMacro, &APP::FEnableMacro)
ON_CID_GEN(cidStartPlaying, &APP::FCmdMacro, &APP::FEnableMacro)
#ifdef WIN
ON_CID_GEN(cidTestFni, &APP::FCmdTestFni, pvNil)
#endif // WIN
#ifdef MAC
ON_CID_GEN(cidSetColor, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetGrayScale, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth1, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth2, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth4, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth8, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth16, &APP::FCmdSetScreen, APP::FEnableScreen)
ON_CID_GEN(cidSetDepth32, &APP::FCmdSetScreen, APP::FEnableScreen)
#endif // MAC
END_CMD_MAP_NIL()

APP vapp;
CLOK vclok(10000);
RND vrnd;

ACR _rgacr[] = {kacrBlack,   kacrBlue,   kacrGreen, kacrCyan,  kacrRed,
                kacrMagenta, kacrYellow, kacrWhite, kacrClear, kacrInvert};
PCSZ _rgszColors[] = {PszLit("bla"), PszLit("blu"), PszLit("gre"), PszLit("cya"), PszLit("red"),
                      PszLit("mag"), PszLit("yel"), PszLit("whi"), PszLit("cle"), PszLit("inv")};
const int32_t _cacr = SIZEOF(_rgacr) / SIZEOF(_rgacr[0]);

RTCLASS(APP)

/***************************************************************************
    Main for a frame app.
***************************************************************************/
int32_t FrameMain(void)
{
    return vapp.Run(fappNil, fgobNil, kginDefault);
}

/***************************************************************************
    Get the name for the frame tester app.
***************************************************************************/
void APP::GetStnAppName(PSTN pstn)
{
    *pstn = PszLit("Frame Tester");
}

/***************************************************************************
    Initialize the app.
***************************************************************************/
bool APP::_FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef)
{
    if (!APP_PAR::_FInit(grfapp, grfgob, ginDef))
        return fFalse;
    vclok.Start(0);
    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Unmarks all hqs, marks all hqs known to be in use, then asserts
    on all unmarked hqs.
***************************************************************************/
void CheckForLostMem(BASE *po)
{
    UnmarkAllMem();
    UnmarkAllObjs();

    MarkMemObj(&vapp); // marks all frame-work memory
    MarkUtilMem();     // marks all util memory
    if (pvNil != po)
        po->MarkMem();

    AssertUnmarkedMem();
    AssertUnmarkedObjs();
}
#endif // DEBUG

/***************************************************************************
    Test the util code.
***************************************************************************/
bool APP::FCmdTestSuite(PCMD pcmd)
{
    TestUtil();
    return fTrue;
}

// graphic pattern rectangle
#define GPRC_PAR GOB
#define kclsGPRC KLCONST4('G', 'P', 'R', 'C')
class GPRC : public GPRC_PAR
{
    RTCLASS_DEC
    MARKMEM

  private:
    ACR _acrFore;
    ACR _acrBack;
    APT _apt;
    bool _fLit;
    bool _fTrackMouse;
    POGN _pogn;

  public:
    GPRC(PGCB pgcb, APT *papt, ACR acrFore, ACR acrBack, bool fTrackMouse);
    ~GPRC(void);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd) override;
};

// graphic fill rectangle
#define GFRC_PAR GOB
#define kclsGFRC KLCONST4('G', 'F', 'R', 'C')
class GFRC : public GFRC_PAR
{
    RTCLASS_DEC

  private:
    bool _fOval;
    bool _fFrame;
    ACR _acr;

  public:
    GFRC(PGCB pgcb, ACR acr, bool fOval);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
};

RTCLASS(GPRC)
RTCLASS(GFRC)

/***************************************************************************
    Constructor for patterned rectangle.
***************************************************************************/
GPRC::GPRC(PGCB pgcb, APT *papt, ACR acrFore, ACR acrBack, bool fTrackMouse) : GOB(pgcb)
{
    _apt = *papt;
    _acrFore = acrFore;
    _acrBack = acrBack;
    _fLit = fFalse;
    _fTrackMouse = fTrackMouse;
}

/***************************************************************************
    Destructor for the GPRC.
***************************************************************************/
GPRC::~GPRC(void)
{
    ReleasePpo(&_pogn);
}

#ifdef DEBUG
/***************************************************************************
    Mark memory for the GPRC.
***************************************************************************/
void GPRC::MarkMem(void)
{
    AssertValid(0);
    GPRC_PAR::MarkMem();
    MarkMemObj(_pogn);
}
#endif // DEBUG

/***************************************************************************
    Draw the patterned rectangle.
***************************************************************************/
void GPRC::Draw(PGNV pgnv, RC *prcClip)
{
    RC rc;

    pgnv->GetRcSrc(&rc);

    if (pvNil == _pogn)
    {
        PT *qrgpt;

        if (pvNil == (_pogn = OGN::PognNew(_fTrackMouse ? 4 : 1)))
            return;

        AssertDo(_pogn->FSetIvMac(_fTrackMouse ? 4 : 1), "why did this fail");
        qrgpt = _pogn->QrgptGet();
        if (_fTrackMouse)
        {
            qrgpt[0].xp = (7 * rc.xpLeft + rc.xpRight) / 8;
            qrgpt[0].yp = (7 * rc.ypTop + rc.ypBottom) / 8;
            qrgpt[1].xp = (rc.xpLeft + 7 * rc.xpRight) / 8;
            qrgpt[1].yp = qrgpt[0].yp;
            qrgpt[2].xp = qrgpt[1].xp;
            qrgpt[2].yp = (rc.ypTop + 7 * rc.ypBottom) / 8;
            qrgpt[3].xp = qrgpt[0].xp;
            qrgpt[3].yp = qrgpt[2].yp;
        }
        else
        {
            qrgpt[0].xp = rc.xpLeft;
            qrgpt[0].yp = rc.ypTop;
        }
    }

    if (_fTrackMouse)
    {
        pgnv->SetPenSize(10, 10);
        pgnv->FramePolyLineApt(_pogn, &_apt, _acrFore, _acrBack);
    }
    else
    {
        pgnv->SetPenSize(7, 10);
        pgnv->FrameOgn(_pogn, _acrFore);
    }

    if (_fLit)
        pgnv->FillRc(&rc, kacrInvert);
}

/***************************************************************************
    Track mouse proc.  Makes us act like a button.
***************************************************************************/
bool GPRC::FCmdTrackMouse(PCMD_MOUSE pcmd)
{
    PT pt;
    bool fDown, fLitNew;

    pt.xp = pcmd->xp;
    pt.yp = pcmd->yp;
    fDown = FPure(pcmd->grfcust & fcustMouse);

    if (pcmd->cid == cidMouseDown)
    {
        Assert(vpcex->PgobTracking() == pvNil, "mouse already being tracked!");
        vpcex->TrackMouse(this);
    }
    else
    {
        Assert(vpcex->PgobTracking() == this, "not tracking mouse!");
        Assert(pcmd->cid == cidTrackMouse, 0);
    }

    if (fDown)
    {
        // mouse is still down
        fLitNew = FPtIn(pt.xp, pt.yp);
        if (FPure(_fLit) != FPure(fLitNew))
        {
            // invert it
            GNV gnv(this);
            RC rc;

            gnv.GetRcSrc(&rc);
            gnv.FillRc(&rc, kacrInvert);
            _fLit = fLitNew;
        }
    }
    else
    {
        vpcex->EndMouseTracking();
        if (_fLit)
        {
            // turn it off and push a close command
            GNV gnv(this);
            RC rc;

            gnv.GetRcSrc(&rc);
            gnv.FillRc(&rc, kacrInvert);

            if (!_fTrackMouse)
            {
                PT rgpt[3];
                POGN pogn;

                rgpt[0].xp = 0;
                rgpt[0].yp = 0;
                rgpt[1].xp = 40;
                rgpt[1].yp = 0;
                rgpt[2].xp = 20;
                rgpt[2].yp = 30;
                if (pvNil != (pogn = _pogn->PognTraceRgpt(rgpt, 3, fognAutoClose)))
                {
                    ReleasePpo(&_pogn);
                    _pogn = pogn;
                }
                _fLit = fFalse;
                InvalRc(pvNil);
            }
            else
                vpcex->EnqueueCid(cidCloseWnd, this);
        }
    }
    return fTrue;
}

/***************************************************************************
    Constructor for filled rectangle.
***************************************************************************/
GFRC::GFRC(PGCB pgcb, ACR acr, bool fOval) : GOB(pgcb)
{
    _acr = acr;
    _fOval = fOval;
    _fFrame = fFalse;
}

/***************************************************************************
    Draw the filled rectangle.
***************************************************************************/
void GFRC::Draw(PGNV pgnv, RC *prcClip)
{
    RC rc;

    pgnv->GetRcSrc(&rc);
    if (_fOval)
    {
        if (_fFrame)
        {
            pgnv->SetPenSize(3, 7);
            pgnv->FrameOval(&rc, _acr);
        }
        else
            pgnv->FillOval(&rc, _acr);
    }
    else
        pgnv->FillRc(&rc, _acr);
}

/***************************************************************************
    The mouse hit us - so die.
***************************************************************************/
void GFRC::MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust)
{
    if (Hid() != 99)
    {
        if (_fOval)
        {
            _fFrame = !_fFrame;
            InvalRc(pvNil);
        }
        else
            vpcex->EnqueueCid(cidCloseWnd, this);
    }
}

// test document
#define TDC_PAR GOB
#define kclsTDC KLCONST3('T', 'D', 'C')
class TDC : public TDC_PAR
{
    RTCLASS_DEC

  protected:
    virtual void _NewRc(void) override;

  public:
    TDC(PGCB pgcb) : GOB(pgcb)
    {
        _NewRc();
    }

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
};

RTCLASS(TDC)

/***************************************************************************
    _NewRc (from GOB) of TDC.
***************************************************************************/
void TDC::_NewRc(void)
{
    // set the scroll bar ranges and values
    PSCB pscb;
    int32_t dxp, dyp;
    RC rc, rcPar;

    PgobPar()->GetRc(&rcPar, cooLocal);
    GetRc(&rc, cooParent);

    dxp = LwMax(0, LwMin(-rc.xpLeft, rcPar.xpRight - rc.xpRight));
    dyp = LwMax(0, LwMin(-rc.ypTop, rcPar.ypBottom - rc.ypBottom));
    if (dxp > 0 || dyp > 0)
    {
        rc.Offset(dxp, dyp);
        SetPos(&rc, pvNil);
        // we'll be getting another _NewRc to set the scroll bars by
        return;
    }

    if ((pscb = (PSCB)PgobFromHidScr(khidHScroll)) != pvNil)
        pscb->SetValMinMax(-rc.xpLeft, 0, LwMax(0, rc.Dxp() - rcPar.Dxp()));
    if ((pscb = (PSCB)PgobFromHidScr(khidVScroll)) != pvNil)
        pscb->SetValMinMax(-rc.ypTop, 0, LwMax(0, rc.Dyp() - rcPar.Dyp()));
}

/***************************************************************************
    Draw routine for the TDC.
***************************************************************************/
void TDC::Draw(PGNV pgnv, RC *prcClip)
{
    RC rc;

    GetRc(&rc, cooLocal);
    pgnv->FillRc(&rc, kacrRed);
}

// graphic test doc window
#define DWN_PAR GOB
#define kclsDWN KLCONST3('D', 'W', 'N')
class DWN : public DWN_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(DWN)

  protected:
    static int32_t _cdwn;

    DWN(PGCB pgcb) : GOB(pgcb)
    {
    }

  public:
    static DWN *PdwnNew(void);

    virtual bool FCmdScroll(PCMD pcmd);
};

BEGIN_CMD_MAP(DWN, GOB)
ON_CID_ME(cidDoScroll, &DWN::FCmdScroll, pvNil)
ON_CID_ME(cidEndScroll, &DWN::FCmdScroll, pvNil)
END_CMD_MAP_NIL()

int32_t DWN::_cdwn = 0;

RTCLASS(DWN)

/***************************************************************************
    Create a new dwn.
***************************************************************************/
DWN *DWN::PdwnNew(void)
{
    DWN *pdwn;
    PGOB pgob;
    STN stn;

    GCB gcb(khidMdi, GOB::PgobScreen());
    if ((pdwn = NewObj DWN(&gcb)) == pvNil)
        return pvNil;

    stn.FFormatSz(PszLit("Graphics Test #%d"), ++_cdwn);
    if (!pdwn->FCreateAndAttachMdi(&stn))
    {
        ReleasePpo(&pdwn);
        return pvNil;
    }

    RC rcRel;
    RC rcAbs;
    APT apt = {0xFF, 0x01, 0x7D, 0x45, 0x5D, 0x41, 0x7F, 0x00};

    // add a size box and some scroll bar
    WSB::PwsbNew(pdwn, fgobNil);
    gcb.Set(khidVScroll, pdwn);
    SCB::PscbNew(&gcb, fscbVert | fscbStandardRc);
    gcb.Set(khidHScroll, pdwn);
    SCB::PscbNew(&gcb, fscbHorz | fscbStandardRc);

    // create a content gob
    gcb.Set(98, pdwn);
    SCB::GetClientRc(fscbVert | fscbHorz, &gcb._rcAbs, &gcb._rcRel);
    pgob = NewObj GOB(&gcb);

    if (pgob == pvNil)
        return pdwn;

    // create the test document gob
    gcb.Set(99, pgob);
    gcb._rcRel.xpLeft = gcb._rcRel.ypTop = krelZero;
    gcb._rcRel.xpRight = gcb._rcRel.ypBottom = krelZero;
    gcb._rcAbs.xpLeft = gcb._rcAbs.ypTop = 0;
    gcb._rcAbs.xpRight = 1000;
    gcb._rcAbs.ypBottom = 1000;
    pgob = NewObj TDC(&gcb);

    if (pgob == pvNil)
        return pdwn;

    gcb.Set(100, pgob);
    gcb._rcRel.xpLeft = gcb._rcRel.ypTop = krelZero;
    gcb._rcRel.xpRight = krelOne / 4;
    gcb._rcRel.ypBottom = krelOne / 4;
    gcb._rcRel.Inset(krelOne / 20, krelOne / 20);
    NewObj GFRC(&gcb, kacrInvert, fFalse);

    gcb._hid = 100;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GFRC(&gcb, kacrClear, fFalse);
    gcb._hid = 102;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GFRC(&gcb, kacrBlue, fTrue);
    gcb._hid = 103;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GFRC(&gcb, kacrGreen, fTrue);

    gcb._hid = 200;
    gcb._rcRel.Offset(-3 * krelOne / 4, krelOne / 4);
    NewObj GPRC(&gcb, &apt, kacrBlue, kacrGreen, fTrue);
    gcb._hid = 201;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrBlue, kacrClear, fTrue);
    gcb._hid = 202;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrBlue, kacrInvert, fTrue);
    gcb._hid = 203;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrClear, kacrInvert, fTrue);

    gcb._hid = 300;
    gcb._rcRel.Offset(-3 * krelOne / 4, krelOne / 4);
    NewObj GPRC(&gcb, &apt, kacrBlue, kacrGreen, fFalse);
    gcb._hid = 301;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrClear, kacrGreen, fFalse);
    gcb._hid = 302;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrInvert, kacrGreen, fFalse);
    gcb._hid = 303;
    gcb._rcRel.Offset(krelOne / 4, 0);
    NewObj GPRC(&gcb, &apt, kacrInvert, kacrClear, fFalse);

    return pdwn;
}

/***************************************************************************
    Handles scrolling.
***************************************************************************/
bool DWN::FCmdScroll(PCMD pcmd)
{
    int32_t hid, val, dval;
    PSCB pscb;
    PGOB pgob;
    RC rc;

    hid = pcmd->rglw[0];
    pscb = (PSCB)PgobFromHid(hid);
    if (pscb == pvNil)
        return fTrue;

    switch (pcmd->cid)
    {
    case cidDoScroll:
        switch (pcmd->rglw[1])
        {
        case scaLineUp:
            dval = -10;
            break;
        case scaPageUp:
            dval = -100;
            break;
        case scaLineDown:
            dval = 10;
            break;
        case scaPageDown:
            dval = 100;
            break;
        default:
            dval = 0;
            break;
        }
        val = pscb->Val() + dval;
        break;

    case cidEndScroll:
        val = pcmd->rglw[1];
        break;
    }
    // pin the new value to the max and min
    val = LwMin(pscb->ValMax(), LwMax(pscb->ValMin(), val));

    if (val != pscb->Val() && (pgob = PgobFromHid(99)) != pvNil)
    {
        pgob->GetRc(&rc, cooParent);
        if (hid == khidHScroll)
            rc.Offset(-rc.xpLeft - val, 0);
        else
            rc.Offset(0, -rc.ypTop - val);
        pgob->SetPos(&rc, pvNil);
        pscb->SetVal(val);
        pgob->GetRc(&rc, cooGpt);
        pgob->DrawTree(pvNil, &rc, pvNil, fgobUseVis);
        pgob->ValidRc(pvNil);
    }
    return fTrue;
}

// text test window
#define TTW_PAR DWN
#define kclsTTW KLCONST3('T', 'T', 'W')
class TTW : public TTW_PAR
{
    RTCLASS_DEC

  private:
    int32_t _cact;

  public:
    TTW(PGCB pgcb) : DWN(pgcb)
    {
    }
    static TTW *PttwNew(void);
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
    void Draw(PGNV pgnv, RC *prcClip) override;
};

RTCLASS(TTW)

/***************************************************************************
    Create a new ttw.
***************************************************************************/
TTW *TTW::PttwNew(void)
{
    TTW *pttw;
    STN stn;
    RC rc;
    PEDPL pedpl;
    GCB gcb(khidMdi, GOB::PgobScreen());

    if ((pttw = NewObj TTW(&gcb)) == pvNil)
        return pvNil;

    stn.FFormatSz(PszLit("Text Test #%d"), ++_cdwn);
    if (!pttw->FCreateAndAttachMdi(&stn))
    {
        ReleasePpo(&pttw);
        return pvNil;
    }

    rc.xpLeft = 5;
    rc.xpRight = 305;
    rc.ypTop = 0;
    rc.ypBottom = 100;
    rc.Offset(5, 0);
    EDPAR edpar(khidEdit, pttw, fgobNil, kginDefault, &rc, pvNil, vntl.OnnSystem(), fontNil, 12, tahLeft, tavTop,
                kacrBlue, kacrYellow);
    pedpl = EDMW::PedmwNew(&edpar);
    if (pvNil != pedpl)
        pedpl->Activate(fTrue);

    return pttw;
}

void TTW::Draw(PGNV pgnv, RC *prcClip)
{
    RC rc;
    int32_t dxp, dyp, idxp, idyp;
    int32_t irc;
    const int32_t cdxp = 8;
    const int32_t cdyp = 10;
    struct TNM // Text alignment NaMe
    {
        int32_t lw;
        achar ch;
    };
    static TNM _rgtnmVert[] = {{tavTop, 'T'}, {tavCenter, 'C'}, {tavBaseline, 'S'}, {tavBottom, 'B'}};
    static TNM _rgtnmHorz[] = {{tahLeft, 'L'}, {tahCenter, 'C'}, {tahRight, 'R'}};
    static APT _apt = {0xF0, 0xF0, 0xF0, 0xF0, 0x0F, 0x0F, 0x0F, 0x0F};

    pgnv->GetRcSrc(&rc);
    pgnv->FillRc(&rc, kacrWhite);
    rc.ypTop += 30;
    pgnv->FillRcApt(&rc, &_apt, kacrRed, kacrBlue);
    dxp = rc.Dxp() / cdxp;
    dyp = rc.Dyp() / cdyp;
    pgnv->SetFont(_cact % vntl.OnnMac(), fontNil, LwMin(10, dyp / 2));
    pgnv->SetPenSize(1, 5);
    irc = 0;
    for (idyp = 0; idyp < cdyp; idyp++)
    {
        for (idxp = 0; idxp < cdxp; idxp++)
        {
            STN stn;
            RC rc;
            int32_t itnm;
            int32_t tah, tav;
            achar chH, chV;

            rc.xpLeft = idxp * dxp;
            rc.ypTop = 30 + idyp * dyp;
            rc.xpRight = rc.xpLeft + dxp;
            rc.ypBottom = rc.ypTop + dyp;
            pgnv->ClipRc(&rc);
            pgnv->FrameRc(&rc, ACR(uint8_t(3 * irc)));
            itnm = irc % CvFromRgv(_rgtnmHorz);
            chH = _rgtnmHorz[itnm].ch;
            tah = _rgtnmHorz[itnm].lw;
            itnm = (irc / CvFromRgv(_rgtnmHorz)) % CvFromRgv(_rgtnmVert);
            chV = _rgtnmVert[itnm].ch;
            tav = _rgtnmVert[itnm].lw;
            stn.FFormatSz(PszLit("(%z:%z, %c:%c)"), _rgszColors[idxp], _rgszColors[idyp], chH, chV);
            pgnv->ClipRc(&rc);
            rc.Inset(1, 5);
            pgnv->SetFontAlign(tah, tav);
            pgnv->DrawStn(&stn, rc.XpCenter(), rc.YpCenter(), _rgacr[idxp], _rgacr[idyp]);
            irc++;
        }
    }
    pgnv->ClipRc(pvNil);
}

void TTW::MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust)
{
    RC rc;
    GNV gnv(this);

    _cact++;
    GetRc(&rc, cooLocal);
    Draw(&gnv, &rc);
}

// Frame rectangle test window
#define RTW_PAR DWN
#define kclsRTW KLCONST3('R', 'T', 'W')
class RTW : public RTW_PAR
{
    RTCLASS_DEC

  private:
    int32_t _cact;

  public:
    RTW(PGCB pgcb) : DWN(pgcb)
    {
        _cact = 0;
    }
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    static RTW *PrtwNew(void);
};

RTCLASS(RTW)

/***************************************************************************
    Create a new rtw.
***************************************************************************/
RTW *RTW::PrtwNew(void)
{
    RTW *prtw;
    STN stn;
    GCB gcb(khidMdi, GOB::PgobScreen());

    if (pvNil == (prtw = NewObj RTW(&gcb)))
        return pvNil;

    stn.FFormatSz(PszLit("Frame rectangle test #%d"), ++_cdwn);
    if (!prtw->FCreateAndAttachMdi(&stn))
    {
        ReleasePpo(&prtw);
        return pvNil;
    }

    return prtw;
}

class DOC : public DOCB
{
  public:
    DOC(void) : DOCB(pvNil, fdocNil)
    {
    }
};

/******************************************************************************
    Test the gob code
******************************************************************************/
bool APP::FCmdNewTestWnd(PCMD pcmd)
{
    int32_t idit;
    int32_t lw;

    if (pcmd->pgg == pvNil)
    {
        // put up the dialog
        PDLG pdlg;

        pdlg = DLG::PdlgNew(200);
        pcmd->pgg = pdlg;
        if (pdlg == pvNil)
            goto LFail;
        idit = pdlg->IditDo();
        if (idit != 0)
            goto LFail;
    }

    pcmd->pgg->GetRgb(2, 0, SIZEOF(int32_t), &lw);
    switch (lw)
    {
    case 0: // new graphics window
        if (pvNil == DWN::PdwnNew())
            goto LFail;
        break;

    case 1: // new text window
        if (pvNil == TTW::PttwNew())
            goto LFail;
        break;

    case 2: // new DMD
        PDOCB pdocb;

        if (pvNil == (pdocb = NewObj DOC()))
            goto LFail;
        if (pvNil == pdocb->PdmdNew())
        {
            ReleasePpo(&pdocb);
            goto LFail;
        }
        ReleasePpo(&pdocb);
        break;
    }
    return fTrue;

LFail:
    pcmd->cid = cidNil; // don't record
    return fTrue;
}

/******************************************************************************
    Test the gob code
******************************************************************************/
bool APP::FCmdTextTestWnd(PCMD pcmd)
{
    TTW::PttwNew();
    return fTrue;
}

/******************************************************************************
    Test rectangle framing speed.
******************************************************************************/
bool APP::FCmdTimeTestRc(PCMD pcmd)
{
    RTW::PrtwNew();
    return fTrue;
}

/******************************************************************************
    Perform the test.
******************************************************************************/
void RTW::MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust)
{
    GNV gnv(this);
    int32_t iact;
    RC rc;
    PT *qrgpt;
    POGN pogn;
    int32_t xp1, xp2, xp3, yp1, yp2, yp3;
    APT apt = {0xFF, 0x01, 0x7D, 0x45, 0x5D, 0x41, 0x7F, 0x00};
    uint32_t ts;
    STN stn;

    if (pvNil == (pogn = OGN::PognNew(8)))
        return;

    gnv.GetRcSrc(&rc);
    xp1 = (9 * rc.xpLeft + rc.xpRight) / 10;
    yp1 = (9 * rc.ypTop + rc.ypBottom) / 10;
    xp2 = rc.XpCenter();
    yp2 = rc.YpCenter();
    xp3 = (rc.xpLeft + 9 * rc.xpRight) / 10;
    yp3 = (rc.ypTop + 9 * rc.ypBottom) / 10;
    AssertDo(pogn->FSetIvMac(8), "why did this fail");
    qrgpt = pogn->QrgptGet();
    qrgpt[0].xp = xp1;
    qrgpt[0].yp = yp1;
    qrgpt[1].xp = xp2;
    qrgpt[1].yp = yp2;
    qrgpt[2].xp = xp3;
    qrgpt[2].yp = yp1;
    qrgpt[3].xp = xp2;
    qrgpt[3].yp = yp2;
    qrgpt[4].xp = xp3;
    qrgpt[4].yp = yp3;
    qrgpt[5].xp = xp2;
    qrgpt[5].yp = yp2;
    qrgpt[6].xp = xp1;
    qrgpt[6].yp = yp3;
    qrgpt[7].xp = xp2;
    qrgpt[7].yp = yp2;
    gnv.SetPenSize(10, 20);

    ts = TsCurrent();
    for (iact = 0; iact < 100; iact++)
    {
        ACR acrFore = _rgacr[iact % 10];
        ACR acrBack = _rgacr[(iact / 10) % 10];

        switch (_cact % 3)
        {
        default:
            break;

        case 0:
            gnv.FrameRcApt(&rc, &apt, acrFore, acrBack);
            break;

        case 1:
            gnv.FrameOgnApt(pogn, &apt, acrFore, acrBack);
            break;

        case 2:
            gnv.LineApt(xp1, yp1, xp3, yp3, &apt, acrFore, acrBack);
            break;
        }
    }

    stn.FFormatSz(PszLit("elapsed time: %u"), TsCurrent() - ts);
    vpappb->TGiveAlertSz(stn.Psz(), bkOk, cokInformation);

    ReleasePpo(&pogn);
    _cact++;
    gnv.GetRcSrc(&rc);
    Draw(&gnv, &rc);
}

/******************************************************************************
    Paint the RTW GOB.
******************************************************************************/
void RTW::Draw(PGNV pgnv, RC *prcClip)
{
    STN stn;
    STN rgstn[3];
    rgstn[0] = PszLit("frame rectangle ");
    rgstn[1] = PszLit("frame polygon ");
    rgstn[2] = PszLit("line draw ");
    RC rc;

    stn.FFormatSz(PszLit("Click to begin the %s test"), &rgstn[_cact % 3]);
    pgnv->GetRcSrc(&rc);
    pgnv->FillRc(&rc, kacrWhite);
    pgnv->SetFontAlign(tahCenter, tavCenter);
    pgnv->DrawStn(&stn, rc.XpCenter(), rc.YpCenter(), kacrBlack, kacrClear);
}

int32_t _LwSqrt(int32_t lw)
{
    uint16_t wHi, wLo, wMid;
    int32_t lwT;

    AssertVar(lw >= 0, "sqrt of negative", &lw);
    for (lwT = wHi = 1; lwT < lw;)
    {
        lwT <<= 2;
        wHi <<= 1;
    }
    if (lwT == lw)
        return wHi;

    wLo = wHi >> 1;

    /* wLo^2 < lw <= wHi^2 */
    while (wLo < wHi)
    {
        wMid = (wLo + wHi) >> 1;
        lwT = (int32_t)wMid * wMid;

        if (lwT < lw)
            wLo = wMid + 1;
        else if (lwT > lw)
            wHi = wMid;
        else
            return wMid;
    }

    wLo = wHi - 1;
    Assert((int32_t)wHi * wHi > lw && (int32_t)wLo * wLo <= lw, "bad logic");

    return (int32_t)(((int32_t)wHi * wHi - lw < lw - (int32_t)wLo * wLo) ? wHi : wLo);
}

/***************************************************************************
    Command function to handle macro recording and playback.
***************************************************************************/
bool APP::FCmdMacro(PCMD pcmd)
{
    FNI fni;
    PCFL pcfl;

    // make sure we're not already recording or playing a macro.
    if (vpcex->FRecording() || vpcex->FPlaying())
        return fTrue;

    if (pcmd->cid == cidStartRecording)
    {
        if (!FGetFniSaveMacro(&fni, 'TEXT', "\pSave As: ", "\pMacro", PszLit("All files\0*.*\0"), vwig.hwndApp))
        {
            return fTrue;
        }
        if ((pcfl = CFL::PcflCreate(&fni, fcflTemp)) == pvNil)
            return fTrue;
        vpcex->Record(pcfl);
        ReleasePpo(&pcfl);
    }
    else
    {
        if (!FGetFniOpenMacro(&fni, pvNil, 0, PszLit("All files\0*.*\0"), vwig.hwndApp))
        {
            return fTrue;
        }

        AssertDo(fni.TExists() == tYes, 0);
        if ((pcfl = CFL::PcflOpen(&fni, fcflNil)) == pvNil)
            return fTrue;
        vpcex->Play(pcfl, 0);
        ReleasePpo(&pcfl);
    }

    return fTrue;
}

/***************************************************************************
    Handles enabling of macro recording and playback commands.
***************************************************************************/
bool APP::FEnableMacro(PCMD pcmd, uint32_t *pgrfeds)
{
    if (vpcex->FRecording() || vpcex->FPlaying())
        *pgrfeds = fedsDisable;
    else
        *pgrfeds = fedsEnable;
    return fTrue;
}

#ifdef WIN
/******************************************************************************
    Test windows fni code to build an fni from a path
******************************************************************************/
bool APP::FCmdTestFni(PCMD pcmd)
{
    int32_t idit;
    STN stn, stnT;
    FNI fni;
    PDLG pdlg;

    // put up the dialog
    pdlg = DLG::PdlgNew(201);
    if (pdlg == pvNil)
        goto LFail;
    idit = pdlg->IditDo();
    if (idit != 0)
        goto LFail;

    pdlg->GetStn(2, &stn);
    ReleasePpo(&pdlg);
    fni.FBuildFromPath(&stn);

    fni.GetStnPath(&stnT);
    MessageBox((HWND)NULL, stnT.Psz(), stn.Psz(), MB_OK);

LFail:
    pcmd->cid = cidNil; // don't record
    return fTrue;
}
#endif // WIN

// point in R3
struct PTT
{
    int32_t xt, yt, zt;
};

// world of perspective
struct WOP
{
    PTT pttEye;
    int32_t ztScreen;
    int32_t ztMax;

    PT PtMap(int32_t xt, int32_t yt, int32_t zt);
    // PTT PttUnmap(int32_t xp, int32_t yp, int32_t yt);
};

/***************************************************************************
    Map an R3 point to a screen point.
***************************************************************************/
PT WOP::PtMap(int32_t xt, int32_t yt, int32_t zt)
{
    PT pt;
    pt.xp = pttEye.xt + LwMulDiv(xt - pttEye.xt, ztScreen - pttEye.zt, zt - pttEye.zt);
    pt.yp = pttEye.yt + LwMulDiv(yt - pttEye.yt, ztScreen - pttEye.zt, zt - pttEye.zt);
    return pt;
}

#ifdef FUTURE
/***************************************************************************
    Map a screen point to an R3 point.  yt stays fixed.
***************************************************************************/
PTT WOP::PttUnmap(int32_t xp, int32_t yp, int32_t yt)
{
    PTT ptt;
    int32_t ypBound;

    if (((yp - pttEye.yt) > 0) != ((yt - pttEye.yt) > 0))
        yp = pttEye.yt;
    ypBound
}
#endif // FUTURE

// perspective doc
class DOCP : public DOCB
{
  public:
    WOP _wop;
    PTT _pttSquare;
    int32_t _dxt, _dyt;

    DOCP(void);

    virtual PDDG PddgNew(PGCB pgcb) override;
    void GetRcPic(RC *prc);
};

// ddg for a docp
class DDP : public DDG
{
  protected:
    DDP(DOCP *pdocp, PGCB pgcb);

  public:
    static DDP *PddpNew(DOCP *pdocp, PGCB pgcb);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;

    void DrawRc(PGNV pgnv);
    void DrawNumbers(PGNV pgnv);
};

/***************************************************************************
    Constructor for a perspective doc.
***************************************************************************/
DOCP::DOCP(void)
{
    _wop.ztScreen = 0;
    _wop.pttEye.zt = -500;
    _wop.pttEye.xt = 320;
    _wop.pttEye.yt = 240;
    _wop.ztMax = 10000;

    _pttSquare.xt = 320;
    _pttSquare.yt = 480;
    _pttSquare.zt = 20;
    _dxt = 50;
    _dyt = 50;
}

/***************************************************************************
    Create a new pane for a perspective doc.
***************************************************************************/
PDDG DOCP::PddgNew(PGCB pgcb)
{
    return DDP::PddpNew(this, pgcb);
}

/***************************************************************************
    Get the on screen rectangle for the perspective doc.
***************************************************************************/
void DOCP::GetRcPic(RC *prc)
{
    PT pt;

    pt = _wop.PtMap(_pttSquare.xt, _pttSquare.yt, _pttSquare.zt);
    prc->xpLeft = pt.xp;
    prc->ypBottom = pt.yp;
    pt = _wop.PtMap(_pttSquare.xt + _dxt, _pttSquare.yt - _dyt, _pttSquare.zt);
    prc->xpRight = pt.xp;
    prc->ypTop = pt.yp;
}

/***************************************************************************
    Constructor for a perspective doc pane.
***************************************************************************/
DDP::DDP(DOCP *pdocp, PGCB pgcb) : DDG(pdocp, pgcb)
{
}

/***************************************************************************
    Static method to create a new DDP.
***************************************************************************/
DDP *DDP::PddpNew(DOCP *pdocp, PGCB pgcb)
{
    DDP *pddp;

    if (pvNil == (pddp = NewObj DDP(pdocp, pgcb)))
        return pvNil;

    if (!pddp->_FInit())
    {
        ReleasePpo(&pddp);
        return pvNil;
    }
    pddp->Activate(fTrue);

    AssertPo(pddp, 0);
    return pddp;
}

/***************************************************************************
    Draws the perspective doc.
***************************************************************************/
void DDP::Draw(PGNV pgnv, RC *prcClip)
{
    DOCP *pdocp = (DOCP *)_pdocb;
    RC rc, rcT;

    pgnv->ClipRc(prcClip);
    pgnv->FillRc(prcClip, kacrWhite);

    // draw the vanishing point in red
    rc.Set(pdocp->_wop.pttEye.xt - 3, pdocp->_wop.pttEye.yt - 3, pdocp->_wop.pttEye.xt + 4, pdocp->_wop.pttEye.yt + 4);
    if (rcT.FIntersect(&rc, prcClip))
    {
        rcT = rc;
        rcT.Inset(3, 0);
        pgnv->FillRc(&rcT, kacrRed);
        rc.Inset(0, 3);
        pgnv->FillRc(&rc, kacrRed);
    }

    // draw the square
    DrawRc(pgnv);
    DrawNumbers(pgnv);
}

/***************************************************************************
    Draw the square and it's coordinates.
***************************************************************************/
void DDP::DrawRc(PGNV pgnv)
{
    DOCP *pdocp = (DOCP *)_pdocb;
    RC rc;

    pdocp->GetRcPic(&rc);
    pgnv->FillRc(&rc, kacrBlue);
}

/***************************************************************************
    Draw the coordinates in the GNV.
***************************************************************************/
void DDP::DrawNumbers(PGNV pgnv)
{
    DOCP *pdocp = (DOCP *)_pdocb;
    STN stn;

    stn.FFormatSz(PszLit("coords: (%d, %d, %d)        "), pdocp->_pttSquare.xt, pdocp->_pttSquare.yt,
                  pdocp->_pttSquare.zt);
    pgnv->DrawStn(&stn, 0, 0, kacrBlack, kacrWhite);
}

/***************************************************************************
    Track the mouse and drag the square.
***************************************************************************/
void DDP::MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust)
{
    DOCP *pdocp = (DOCP *)_pdocb;
    PT pt(xp, yp);
    PT ptPrev = pt;
    PT dpt;
    RC rc;
    bool fDown = fTrue;

    for (; fDown; GetPtMouse(&pt, &fDown))
    {
        dpt = pt - ptPrev;
        if (grfcust & fcustShift)
        {
            // x - z
            dpt.yp = pdocp->_pttSquare.zt -
                     LwBound(pdocp->_pttSquare.zt - dpt.yp, pdocp->_wop.pttEye.zt / 2, pdocp->_wop.ztMax);
        }
        else if (grfcust & fcustCmd)
        {
            // y - z
            dpt.xp = LwBound(pdocp->_pttSquare.zt + dpt.xp, pdocp->_wop.pttEye.zt / 2, pdocp->_wop.ztMax) -
                     pdocp->_pttSquare.zt;
        }
        if (dpt.xp != 0 || dpt.yp != 0)
        {
            pdocp->GetRcPic(&rc);
            vpappb->MarkRc(&rc, this);
            if (grfcust & fcustShift)
            {
                // x - z
                pdocp->_pttSquare.xt += dpt.xp;
                pdocp->_pttSquare.zt -= dpt.yp;
            }
            else if (grfcust & fcustCmd)
            {
                // y - z
                pdocp->_pttSquare.zt += dpt.xp;
                pdocp->_pttSquare.yt += dpt.yp;
            }
            else
            {
                // x - y
                pdocp->_pttSquare.xt += dpt.xp;
                pdocp->_pttSquare.yt += dpt.yp;
            }
            pdocp->GetRcPic(&rc);
            vpappb->MarkRc(&rc, this);
            rc.Set(0, 0, 20, 200);
            vpappb->MarkRc(&rc, this);
            vpappb->UpdateMarked();
        }
        ptPrev = pt;
    }
}

/***************************************************************************
    Create a new perspective doc and window.
***************************************************************************/
bool APP::FCmdTestPerspective(PCMD pcmd)
{
    DOCP *pdocp;

    if (pvNil != (pdocp = NewObj DOCP()))
    {
        pdocp->PdmdNew();
        ReleasePpo(&pdocp);
    }
    return fTrue;
}

// picture document
#define DOCPIC_PAR DOCB
class DOCPIC : public DOCPIC_PAR
{
    MARKMEM

  protected:
    PPIC _ppic;
    DOCPIC(void);

  public:
    ~DOCPIC(void);

    static DOCPIC *PdocpicNew(void);

    virtual PDDG PddgNew(PGCB pgcb) override;
    PPIC Ppic(void)
    {
        return _ppic;
    }
    virtual bool FSaveToFni(FNI *pfni, bool fSetFni) override;
};

// picture document display
#define DDPIC_PAR DDG
class DDPIC : public DDPIC_PAR
{
  protected:
    DDPIC(DOCPIC *pdocpic, PGCB pgcb);

  public:
    static DDPIC *PddpicNew(DOCPIC *pdocpic, PGCB pgcb);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
};

/***************************************************************************
    Constructor for picture document.
***************************************************************************/
DOCPIC::DOCPIC(void)
{
    _ppic = pvNil;
}

/***************************************************************************
    Destructor for picture document.
***************************************************************************/
DOCPIC::~DOCPIC(void)
{
    ReleasePpo(&_ppic);
}

#ifdef DEBUG
/***************************************************************************
    Mark memory for the DOCPIC.
***************************************************************************/
void DOCPIC::MarkMem(void)
{
    AssertValid(0);
    DOCPIC_PAR::MarkMem();
    MarkMemObj(_ppic);
}
#endif // DEBUG

/***************************************************************************
    Static method to create a new picture document.
***************************************************************************/
DOCPIC *DOCPIC::PdocpicNew(void)
{
    static int32_t _cact = 0;
    PGPT pgpt;
    PGNV pgnv;
    PPIC ppic;
    DOCPIC *pdocpic;
    int32_t i, j;
    CLR clr;
    PGL pglclr;
    RC rc(0, 0, 16, 16);

    if (pvNil == (pglclr = GL::PglNew(SIZEOF(CLR), 256)))
        return pvNil;
    for (i = 0; i < 256; i++)
    {
        ClearPb(&clr, SIZEOF(clr));
        switch (_cact)
        {
        default:
            clr.bRed = uint8_t(255 - i);
            break;
        case 1:
            clr.bGreen = uint8_t(255 - i);
            break;
        case 2:
            clr.bBlue = uint8_t(255 - i);
            break;
        }
        pglclr->FPush(&clr);
        _cact = (_cact + 1) % 3;
    }
    GPT::SetActiveColors(pglclr, fpalIdentity);
    ReleasePpo(&pglclr);

    if (pvNil == (pgpt = GPT::PgptNewPic(&rc)))
        return pvNil;
    if (pvNil != (pgnv = NewObj GNV(pgpt)))
    {
        rc.Offset(rc.Dxp() / 2, 0);
        pgnv->FillOval(&rc, kacrMagenta);
        for (i = 0; i < 16; i++)
        {
            for (j = 0; j < 16; j++)
            {
                rc.Set(i, j, i + 1, j + 1);
                if ((i + j) & 1)
                    pgnv->FillRc(&rc, ACR(uint8_t(i * 16 + j)));
                else
                    pgnv->FillOval(&rc, ACR(uint8_t(i * 16 + j)));
            }
        }
        ReleasePpo(&pgnv);
    }
    ppic = pgpt->PpicRelease();
    if (pvNil == ppic)
        return pvNil;
    if (pvNil == (pdocpic = NewObj DOCPIC))
    {
        ReleasePpo(&ppic);
        return pvNil;
    }
    pdocpic->_ppic = ppic;
    return pdocpic;
}

/***************************************************************************
    Create a new display gob for the document.
***************************************************************************/
PDDG DOCPIC::PddgNew(PGCB pgcb)
{
    return DDPIC::PddpicNew(this, pgcb);
}

/***************************************************************************
    Save the picture in a chunky file.
***************************************************************************/
bool DOCPIC::FSaveToFni(FNI *pfni, bool fSetFni)
{
    PCFL pcfl;
    bool fT;
    CNO cno;

    if (pvNil == (pcfl = CFL::PcflCreate(pfni, fcflNil)))
        return fFalse;
    fT = _ppic->FAddToCfl(pcfl, kctgGraphic, &cno) && pcfl->FSave('FT  ');
    ReleasePpo(&pcfl);
    if (!fT)
        pfni->FDelete();
    return fT;
}

/***************************************************************************
    Constructor for a picture doc pane.
***************************************************************************/
DDPIC::DDPIC(DOCPIC *pdocpic, PGCB pgcb) : DDG(pdocpic, pgcb)
{
}

/***************************************************************************
    Static method to create a new DDPIC.
***************************************************************************/
DDPIC *DDPIC::PddpicNew(DOCPIC *pdocpic, PGCB pgcb)
{
    DDPIC *pddpic;

    if (pvNil == (pddpic = NewObj DDPIC(pdocpic, pgcb)))
        return pvNil;

    if (!pddpic->_FInit())
    {
        ReleasePpo(&pddpic);
        return pvNil;
    }
    pddpic->Activate(fTrue);

    AssertPo(pddpic, 0);
    return pddpic;
}

/***************************************************************************
    Draws the picture doc.
***************************************************************************/
void DDPIC::Draw(PGNV pgnv, RC *prcClip)
{
    DOCPIC *pdocpic = (DOCPIC *)_pdocb;
    int32_t i, j;
    RC rc(0, 0, 33, 16);

    // draw the picture and draw directly
    pgnv->FillRc(prcClip, kacrLtGray);
    rc.Inset(-1, -1);
    pgnv->SetRcSrc(&rc);
    rc.Inset(1, 1);
    rc.xpLeft += 17;
    pgnv->DrawPic(pdocpic->Ppic(), &rc);

    for (i = 0; i < 16; i++)
    {
        for (j = 0; j < 16; j++)
        {
            rc.Set(i, j, i + 1, j + 1);
            if ((i + j) & 1)
                pgnv->FillRc(&rc, ACR(uint8_t(i * 16 + j)));
            else
                pgnv->FillOval(&rc, ACR(uint8_t(i * 16 + j)));
        }
    }
}

/***************************************************************************
    Create a new picture doc and window.
***************************************************************************/
bool APP::FCmdTestPictures(PCMD pcmd)
{
    DOCPIC *pdocpic;

    if (pvNil != (pdocpic = DOCPIC::PdocpicNew()))
    {
        pdocpic->PdmdNew();
        ReleasePpo(&pdocpic);
    }
    return fTrue;
}

// GPT Document.
#define DOCGPT_PAR DOCB
class DOCGPT : public DOCGPT_PAR
{
    MARKMEM

  protected:
    DOCGPT(void);
    PGPT _pgpt;

  public:
    ~DOCGPT(void);

    static DOCGPT *PdocgptNew(void);

    virtual PDDG PddgNew(PGCB pgcb) override;
    PGPT Pgpt(void)
    {
        return _pgpt;
    }
};

// GPT display class.
#define DDGPT_PAR DDG
class DDGPT : public DDGPT_PAR
{
  protected:
    DDGPT(DOCGPT *pdocgpt, PGCB pgcb);

  public:
    static DDGPT *PddgptNew(DOCGPT *pdocgpt, PGCB pgcb);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
};

/***************************************************************************
    Constructor for mbmp document.
***************************************************************************/
DOCGPT::DOCGPT(void)
{
    _pgpt = pvNil;
}

/***************************************************************************
    Destructor for mbmp document.
***************************************************************************/
DOCGPT::~DOCGPT(void)
{
    ReleasePpo(&_pgpt);
}

#ifdef DEBUG
/***************************************************************************
    Mark memory for the DOCGPT.
***************************************************************************/
void DOCGPT::MarkMem(void)
{
    AssertValid(0);
    DOCGPT_PAR::MarkMem();
    MarkMemObj(_pgpt);
}
#endif // DEBUG

/***************************************************************************
    Static method to create a new mbmp document.
***************************************************************************/
DOCGPT *DOCGPT::PdocgptNew(void)
{
    DOCGPT *pdocgpt;
    PGPT pgpt;
    PGNV pgnv;
    PMBMP pmbmp;
    int32_t i;
    RC rc(0, 0, 256, 256);
    RC rcT;
    ACR acr;
    CLR clr;
    PGL pglclr;
    static int32_t _cact = 0;
    PT pt(0, 0);
    ACR acr63(63), acr127(127), acr191(191);

    if (pvNil == (pglclr = GL::PglNew(SIZEOF(CLR), 256)))
        return pvNil;
    for (i = 0; i < 256; i++)
    {
        ClearPb(&clr, SIZEOF(clr));
        switch (_cact)
        {
        default:
            clr.bRed = uint8_t(255 - i);
            break;
        case 1:
            clr.bGreen = uint8_t(255 - i);
            break;
        case 2:
            clr.bBlue = uint8_t(255 - i);
            break;
        }
        if (i == 100) // make 100 always the same	- yellow
        {
            clr.bRed = uint8_t(kbMax);
            clr.bGreen = uint8_t(kbMax);
            clr.bBlue = uint8_t(0);
        }
        pglclr->FPush(&clr);
        _cact = (_cact + 1) % 3;
    }
    GPT::SetActiveColors(pglclr, fpalIdentity);
    ReleasePpo(&pglclr);

    pdocgpt = pvNil;
    pgpt = pvNil;
    pmbmp = pvNil;
    pgnv = pvNil;

    // Create the gpt
    if (pvNil == (pgpt = GPT::PgptNewOffscreen(&rc, 8)))
        goto LFail;

    if (pvNil == (pgnv = NewObj GNV(pgpt)))
        goto LFail;

    // The color mapped to 100 is the transparent pixel value for
    // the MBMP, so start everything as transparent.
    acr.SetToIndex(100);
    pgnv->FillRc(&rc, acr);

    // Fill the foreground with a pattern
    rcT.Set(0, 0, 128, 128);
    pgnv->FillRc(&rcT, acr63);
    rcT.Set(128, 128, 256, 256);
    pgnv->FillOval(&rcT, acr63);
    rcT.Set(48, 48, 80, 80);
    pgnv->FillRc(&rcT, acr127);
    rcT.Set(176, 176, 208, 208);
    pgnv->FillOval(&rcT, acr127);
    rcT.Set(240, 112, 256, 128);
    pgnv->FillOval(&rcT, acr191);
    rcT.Set(0, 128, 16, 144);
    pgnv->FillRc(&rcT, acr191);
    rcT.Set(48, 144, 80, 176);
    pgnv->FillRc(&rcT, kacrBlack);
    rcT.Set(176, 80, 208, 112);
    pgnv->FillOval(&rcT, kacrBlack);
    rcT.Set(0, 208, 48, 256);
    pgnv->FillRc(&rcT, kacrCyan);
    rcT.Set(208, 0, 256, 48);
    pgnv->FillOval(&rcT, kacrCyan);
    rcT.Set(64, 192, 128, 256);
    pgnv->FillRc(&rcT, kacrWhite);
    rcT.Set(128, 0, 192, 64);
    pgnv->FillOval(&rcT, kacrWhite);

    // Create an MBMP from the foreground.
    pmbmp = MBMP::PmbmpNew(pgpt->PrgbLockPixels(), pgpt->CbRow(), rc.Dyp(), &rc, 0, 0, 100);
    pgpt->Unlock();

    if (pvNil == pmbmp)
        goto LFail;

    pgnv->FillRc(&rc, kacrMagenta);
    pgnv->DrawMbmp(pmbmp, 0, 0);

    if (pvNil != (pdocgpt = NewObj DOCGPT))
    {
        pdocgpt->_pgpt = pgpt;
        pgpt = pvNil;
    }

    if (pvNil == (pglclr = GL::PglNew(SIZEOF(CLR), 256)))
        goto LFail;
    for (i = 0; i < 128; i++)
    {
        ClearPb(&clr, SIZEOF(clr));
        clr.bGreen = uint8_t(i * 2);
        pglclr->FPush(&clr);
    }
    for (; i < 256; i++)
    {
        ClearPb(&clr, SIZEOF(clr));
        clr.bGreen = 255;
        clr.bRed = clr.bBlue = (uint8_t)((i - 128) * 2);
        pglclr->FPush(&clr);
    }

    pdocgpt->_pgpt->SetOffscreenColors(pglclr);
    ReleasePpo(&pglclr);

LFail:
    ReleasePpo(&pgnv);
    ReleasePpo(&pmbmp);
    ReleasePpo(&pgpt);

    return pdocgpt;
}

/***************************************************************************
    Create a new display gob for the document.
***************************************************************************/
PDDG DOCGPT::PddgNew(PGCB pgcb)
{
    return DDGPT::PddgptNew(this, pgcb);
}

/***************************************************************************
    Constructor for a gpt doc pane.
***************************************************************************/
DDGPT::DDGPT(DOCGPT *pdocgpt, PGCB pgcb) : DDG(pdocgpt, pgcb)
{
}

/***************************************************************************
    Static method to create a new DDMBMP.
***************************************************************************/
DDGPT *DDGPT::PddgptNew(DOCGPT *pdocgpt, PGCB pgcb)
{
    DDGPT *pddgpt;

    if (pvNil == (pddgpt = NewObj DDGPT(pdocgpt, pgcb)))
        return pvNil;

    if (!pddgpt->_FInit())
    {
        ReleasePpo(&pddgpt);
        return pvNil;
    }
    pddgpt->Activate(fTrue);

    AssertPo(pddgpt, 0);
    return pddgpt;
}

/***************************************************************************
    Draws the gpt doc.
***************************************************************************/
void DDGPT::Draw(PGNV pgnv, RC *prcClip)
{
    DOCGPT *pdocgpt = (DOCGPT *)_pdocb;
    PGNV pgnvT;
    RC rc(0, 0, 256, 256);
    RC rcT;

    if (pvNil == (pgnvT = NewObj GNV(pdocgpt->Pgpt())))
        return;
    GetRc(&rcT, cooLocal);
    pgnv->CopyPixels(pgnvT, &rc, &rcT);
    ReleasePpo(&pgnvT);
    return;
}

/***************************************************************************
    Create a new mbmp and window.
***************************************************************************/
bool APP::FCmdTestMbmps(PCMD pcmd)
{
    DOCGPT *pdocgpt;

    if (pvNil != (pdocgpt = DOCGPT::PdocgptNew()))
    {
        pdocgpt->PdmdNew();
        ReleasePpo(&pdocgpt);
    }
    return fTrue;
}

#ifdef MAC
/***************************************************************************
    Set the main screen as indicated.
***************************************************************************/
bool APP::FCmdSetScreen(PCMD pcmd)
{
    bool tColor = tMaybe;
    int32_t cbit = 0;

    switch (pcmd->cid)
    {
    default:
        return fFalse;

    case cidSetColor:
        tColor = tYes;
        break;
    case cidSetGrayScale:
        tColor = tNo;
        break;
    case cidSetDepth1:
        cbit = 1;
        break;
    case cidSetDepth2:
        cbit = 2;
        break;
    case cidSetDepth4:
        cbit = 4;
        break;
    case cidSetDepth8:
        cbit = 8;
        break;
    case cidSetDepth16:
        cbit = 16;
        break;
    case cidSetDepth32:
        cbit = 32;
        break;
    }
    GPT::FSetScreenState(cbit, tColor);
    return fTrue;
}

/***************************************************************************
    Set the menu stuff for the screen resolutions.
***************************************************************************/
bool APP::FEnableScreen(PCMD pcmd, uint32_t *pgrfeds)
{
    int32_t cbitPixel;
    bool fColor;
    bool fCheck;
    bool fEnable;
    int32_t cbit;

    GPT::GetScreenState(&cbitPixel, &fColor);
    switch (pcmd->cid)
    {
    default:
        return fFalse;

    case cidSetColor:
        fCheck = fColor;
        fEnable = fCheck || GPT::FCanScreen(cbitPixel, fTrue);
        break;
    case cidSetGrayScale:
        fCheck = !fColor;
        fEnable = fCheck || GPT::FCanScreen(cbitPixel, fFalse);
        break;
    case cidSetDepth1:
        cbit = 1;
        goto LAll;
    case cidSetDepth2:
        cbit = 2;
        goto LAll;
    case cidSetDepth4:
        cbit = 4;
        goto LAll;
    case cidSetDepth8:
        cbit = 8;
        goto LAll;
    case cidSetDepth16:
        cbit = 16;
        goto LAll;
    case cidSetDepth32:
        cbit = 32;
    LAll:
        fCheck = cbit == cbitPixel;
        fEnable = fCheck || GPT::FCanScreen(cbit, fColor);
        break;
    }

    *pgrfeds = (fEnable ? fedsEnable : fedsDisable) | (fCheck ? fedsBullet : fedsUncheck);
    return fTrue;
}
#endif // MAC

// test animations
typedef class TAN *PTAN;
#define TAN_PAR GOB
class TAN : public TAN_PAR
{
    CMD_MAP_DEC(TAN)

  protected:
    static int32_t _cact;
    APT _apt;
    uint32_t _dtim;

    TAN(PGCB pgcb);

  public:
    static PTAN PtanNew(void);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdAlarm(PCMD pcmd);
};

BEGIN_CMD_MAP(TAN, GOB)
ON_CID_ME(cidAlarm, &TAN::FCmdAlarm, pvNil)
END_CMD_MAP_NIL()

int32_t TAN::_cact = 0;

/***************************************************************************
    Create a new picture doc and window.
***************************************************************************/
bool APP::FCmdFastUpdate(PCMD pcmd)
{
    TAN::PtanNew();
    return fTrue;
}

/***************************************************************************
    Constructor for a Test animation gob.
***************************************************************************/
TAN::TAN(PGCB pgcb) : GOB(pgcb)
{
}

/***************************************************************************
    Create a new animation test gob
***************************************************************************/
PTAN TAN::PtanNew(void)
{
    PTAN ptan;
    RC rc;
    STN stn;
    APT apt = {0xF0, 0xF0, 0xF0, 0xF0, 0x0F, 0x0F, 0x0F, 0x0F};
    GCB gcb(khidMdi, GOB::PgobScreen());

    if (pvNil == (ptan = NewObj TAN(&gcb)))
        return pvNil;
    ptan->_dtim = (1 << _cact);
    _cact = (_cact + 1) % 5;
    stn.FFormatSz(PszLit("Animation test (%d)"), ptan->_dtim);
    if (!ptan->FCreateAndAttachMdi(&stn))
    {
        ReleasePpo(&ptan);
        return pvNil;
    }
    ptan->_apt = apt;

    rc.Set(0, 0, 100, 100);
    gcb.Set(100, ptan, fgobNil, kginMark, &rc);
    NewObj GFRC(&gcb, ACR(0x80), fFalse);
    gcb._hid = 101;
    NewObj GFRC(&gcb, ACR(0x35), fFalse);
    vclok.FSetAlarm(ptan->_dtim, ptan);
    return ptan;
}

/***************************************************************************
    Alarm handler for a TAN.
***************************************************************************/
bool TAN::FCmdAlarm(PCMD pcmd)
{
    if (pcmd->rglw[0] != vclok.Hid())
        return fFalse; // wrong clock

    RC rcPar, rc;
    RC rcT;
    PGOB pgob;
    int32_t cact;

    GetRc(&rcPar, cooLocal);
    for (cact = 0, pgob = PgobFirstChild(); pvNil != pgob; pgob = pgob->PgobNextSib(), cact++)
    {
        pgob->GetRc(&rc, cooParent);
        if (cact & 1)
        {
            rc.Offset(15, 10);
            if (rc.ypTop >= rcPar.ypBottom)
                rc.Offset(0, -rcPar.Dyp() - rc.Dyp());
        }
        else
        {
            rc.Offset(10, -15);
            if (rc.ypBottom <= rcPar.ypTop)
                rc.Offset(0, rcPar.Dyp() + rc.Dyp());
        }
        if (rc.xpLeft >= rcPar.xpRight)
            rc.Offset(-rcPar.Dxp() - rc.Dxp(), 0);
        pgob->SetPos(&rc, pvNil);
    }
    vclok.FSetAlarm(_dtim, this);
    return fTrue;
}

/***************************************************************************
    Draw the thing
***************************************************************************/
void TAN::Draw(PGNV pgnv, RC *prcClip)
{
    //_apt.MoveOrigin(1, 1);
    pgnv->FillRcApt(prcClip, &_apt, kacrRed, kacrBlue);
}

typedef class TED *PTED;
#define TED_PAR GOB
class TED : public TED_PAR
{
  protected:
    TED(void) : GOB(khidMdi)
    {
    }

  public:
    static PTED PtedNew(void);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdBadKey(PCMD_BADKEY pcmd) override;
};

/***************************************************************************
    Create a new window containing a bunch of edit controls.
***************************************************************************/
bool APP::FCmdTextEdit(PCMD pcmd)
{
    TED::PtedNew();
    return fTrue;
}

/***************************************************************************
    Static method to create a new TED.
***************************************************************************/
PTED TED::PtedNew(void)
{
    RC rcRel, rcAbs;
    EDPAR edpar;
    PTED pted;
    STN stn;
    int32_t i, j;
    int32_t hid;
    int32_t rgtah[3] = {tahLeft, tahCenter, tahRight};
    int32_t rgtav[3] = {tavTop, tavCenter, tavBottom};

    if (pvNil == (pted = NewObj TED))
        return pvNil;

    stn = PszLit("Test Edits");
    if (!pted->FCreateAndAttachMdi(&stn))
    {
        ReleasePpo(&pted);
        return pvNil;
    }

    rcAbs.Set(1, 1, -1, -1);
    hid = 1000;
    for (i = 0; i < 3; i++)
    {
        for (j = 0; j < 3; j++)
        {
            rcRel.Set(i * krelOne / 3, j * krelOne / 9, (i + 1) * krelOne / 3, (j + 1) * krelOne / 9);
            edpar.Set(hid++, pted, fgobNil, kginDefault, &rcAbs, &rcRel, vntl.OnnSystem(), fontNil, 12, rgtah[i],
                      rgtav[j], kacrBlue, kacrYellow);
            EDSL::PedslNew(&edpar);
        }
    }

    for (i = 0; i < 3; i++)
    {
        for (j = 0; j < 3; j++)
        {
            rcRel.Set(i * krelOne / 3, (j + 3) * krelOne / 9, (i + 1) * krelOne / 3, (j + 4) * krelOne / 9);
            edpar.Set(hid++, pted, fgobNil, kginDefault, &rcAbs, &rcRel, vntl.OnnSystem(), fontNil, 12, rgtah[i],
                      rgtav[j], kacrBlue, kacrYellow);
            EDML::PedmlNew(&edpar);
        }
    }

    for (i = 0; i < 3; i++)
    {
        for (j = 0; j < 3; j++)
        {
            rcRel.Set(i * krelOne / 3, (j + 6) * krelOne / 9, (i + 1) * krelOne / 3, (j + 7) * krelOne / 9);
            edpar.Set(hid++, pted, fgobNil, kginDefault, &rcAbs, &rcRel, vntl.OnnSystem(), fontNil, 12, rgtah[i],
                      rgtav[j], kacrBlue, kacrYellow);
            EDMW::PedmwNew(&edpar);
        }
    }
    return pted;
}

/***************************************************************************
    A key wasn't handled by the edit control.
***************************************************************************/
bool TED::FCmdBadKey(PCMD_BADKEY pcmd)
{
    int32_t hid;

    switch (pcmd->ch)
    {
    case kchReturn:
    case kchTab:
        hid = pcmd->hid;
        AssertIn(hid, 1000, 10027);
        if (pcmd->grfcust & fcustShift)
            hid = (hid - 974) % 27 + 1000;
        else
            hid = (hid - 999) % 27 + 1000;
        vpcex->EnqueueCid(cidActivateSel, PgobFromHid(hid));
        break;
    }
    return fTrue;
}

/***************************************************************************
    Draw the background of the TED.
***************************************************************************/
void TED::Draw(PGNV pgnv, RC *prcClip)
{
    pgnv->FillRc(prcClip, kacrWhite);
}
