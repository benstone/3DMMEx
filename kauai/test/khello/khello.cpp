/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Kauai Hello World application. This application tests Kauai GUI's
    input handling and rendering functions.

***************************************************************************/
#include "kidframe.h"
#include "resource.h"
ASSERTNAME

// Background GOB class
#define BackgroundGob_PAR GOB
#define kclsBackgroundGob KLCONST4('k', 'b', 'k', 'g')
class BackgroundGob : public BackgroundGob_PAR
{
    RTCLASS_DEC

  public:
    BackgroundGob(GCB *pgcb) : GOB(pgcb)
    {
    }

    // Render the GOB
    virtual void Draw(PGNV pgnv, RC *prcClip) override;

    // Set the background to a pattern
    void TogglePattern();

  private:
    bool _fPattern = fFalse;
};

// Maximum number of messages to display in the message logger GOB
const int32_t kcstnCmdMax = 24;

// GOB that shows mouse and keyboard messages
#define MessageLogGob_PAR GOB
#define kclsMessageLogGob KLCONST4('k', 'm', 's', 'g')
class MessageLogGob : public MessageLogGob_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(MessageLogGob)

  public:
    MessageLogGob(GCB *pgcb) : GOB(pgcb)
    {
        for (int32_t istn = 0; istn < kcstnCmdMax; istn++)
        {
            stnLastCmd[istn].SetNil();
        }
    }

    // Render the GOB
    virtual void Draw(PGNV pgnv, RC *prcClip) override;

    virtual bool FCmdMouseMove(PCMD_MOUSE cmd) override;
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd) override;
    bool FCmdRollOff(PCMD cmd);

    void AddCmd(STN stnCmd);

  private:
    // List of last command entries
    STN stnLastCmd[kcstnCmdMax];

    // Position in list
    int32_t _istnNextCmd = 0;
};

BEGIN_CMD_MAP(MessageLogGob, GOB)
ON_CID_GEN(cidMouseMove, &MessageLogGob::FCmdMouseMove, pvNil)
ON_CID_GEN(cidRollOff, &MessageLogGob::FCmdRollOff, pvNil)
END_CMD_MAP_NIL()

#define KhelloApp_PAR APPB
#define kclsKhelloApp KLCONST4('k', 'h', 'l', 'o')

// Hello World application class
class KhelloApp : public KhelloApp_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(KhelloApp)
    MARKMEM

  protected:
    virtual bool _FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef) override;
    virtual void _CleanUp() override;

  public:
    virtual void GetStnAppName(PSTN pstn) override;

    // Commands
    bool FCmdExit(PCMD pcmd);

    bool FCmdKey(PCMD_KEY pcmd);

    bool FCmdDissolve(PCMD pcmd);
    bool FCmdPattern(PCMD pcmd);

  private:
    BackgroundGob *_gobBackground = pvNil;
    MessageLogGob *_gobTest = pvNil;
    PATBL _patbl = pvNil;
};

#define cidDissolve 50001
#define cidPattern 50002

BEGIN_CMD_MAP(KhelloApp, APPB)
ON_CID_GEN(cidClose, &KhelloApp::FCmdExit, pvNil)
ON_CID_GEN(cidKey, &KhelloApp::FCmdKey, pvNil)
ON_CID_GEN(cidDissolve, &KhelloApp::FCmdDissolve, pvNil)
ON_CID_GEN(cidPattern, &KhelloApp::FCmdPattern, pvNil)
END_CMD_MAP_NIL()

// Globals
KhelloApp vapp;

// Define reference counting and runtime type functions for app classes
RTCLASS(KhelloApp)
RTCLASS(BackgroundGob)
RTCLASS(MessageLogGob)

// Map of cursor state bitmask values to strings
PCSZ mpfcustpsz[] = {
    PszLit("CTRL"),  // fcustCmd
    PszLit("SHIFT"), // fcustShift
    PszLit("ALT"),   // fcustOption
    PszLit("MOUSE"), // fcustMouse
};

// Entrypoint
void FrameMain(void)
{
    // TODO: offscreen drawing is broken?
    bool fOffscreenDrawing = fFalse;

    uint32_t grfApp = fappNil;

    if (fOffscreenDrawing)
    {
        grfApp |= fappOffscreen;
    }
    else
    {
        grfApp |= fappOnscreen;
    }

    vapp.Run(grfApp, fgobNil, kginDefault);
}

// Returns the name of the application
void KhelloApp::GetStnAppName(PSTN pstn)
{
    *pstn = PszLit("Kauai Hello World");
}

// App initialization
bool KhelloApp::_FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef)
{
    if (!KhelloApp_PAR::_FInit(grfapp, grfgob, ginDef))
        return fFalse;

    // Create background GOB
    RC rcRel(0, 0, krelOne, krelOne);
    GCB gcbBack(CMH::HidUnique(), GOB::PgobScreen(), fgobNil, kginMark, pvNil, &rcRel);

    _gobBackground = NewObj BackgroundGob(&gcbBack);

    // Create message log GOB
    RC rcAbs(0, 0, 480, 384);

    RC rcBackground;
    _gobBackground->GetRc(&rcBackground, cooHwnd);
    rcAbs.CenterOnRc(&rcBackground);

    GCB gcb(CMH::HidUnique(), _gobBackground, fgobNil, kginMark, &rcAbs, pvNil);

    _gobTest = NewObj MessageLogGob(&gcb);

    // Create accelerator table
    _patbl = ATBL::PatblNew(HidUnique(), vpcex);
    if (_patbl != pvNil)
    {
        AssertDo(vpcex->FAddCmh(_patbl, 0, kgrfcmmAll), "Could not register accelerator table");
        AssertDo(_patbl->FAddCmdKey(VK_FROM_ALPHA('Q'), fcustCmd, cidQuit), "Could not add accelerator table entry");
        AssertDo(_patbl->FAddCmdKey(VK_FROM_ALPHA('D'), fcustNil, cidDissolve),
                 "Could not add accelerator table entry");
        AssertDo(_patbl->FAddCmdKey(VK_FROM_ALPHA('P'), fcustNil, cidPattern), "Could not add accelerator table entry");
    }

    return fTrue;
}

void KhelloApp::_CleanUp()
{
    ReleasePpo(&_gobTest);
    ReleasePpo(&_gobBackground);
    ReleasePpo(&_patbl);
}

#ifdef DEBUG

void KhelloApp::MarkMem()
{
    KhelloApp_PAR::MarkMem();
    MarkMemObj(_gobBackground);
    MarkMemObj(_gobTest);
    MarkMemObj(_patbl);
}

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

bool KhelloApp::FCmdExit(PCMD pcmd)
{
    this->Quit(fFalse);
    return fTrue;
}

bool KhelloApp::FCmdKey(PCMD_KEY pcmd)
{
    STN stnCmd;

    if (pcmd->ch != chNil)
    {
        stnCmd.FFormatSz(PszLit("cidKey: ch: %c vk: 0x%x cact: %d grfcust: %d"), pcmd->ch, pcmd->vk, pcmd->cact,
                         pcmd->grfcust);
    }
    else
    {
        stnCmd.FFormatSz(PszLit("cidKey: ch: chNil vk: 0x%x cact: %d grfcust: %d"), pcmd->vk, pcmd->cact,
                         pcmd->grfcust);
    }

    _gobTest->AddCmd(stnCmd);

    int32_t dxp = 0, dyp = 0;

    switch (pcmd->vk)
    {
    case kvkLeft:
        dxp = -1;
        break;
    case kvkRight:
        dxp = 1;
        break;
    case kvkUp:
        dyp = -1;
        break;
    case kvkDown:
        dyp = 1;
        break;
    default:
        break;
    }

    if (dxp != 0 || dyp != 0)
    {
        RC rc;
        _gobTest->GetRc(&rc, cooHwnd);

        rc.Offset(dxp, dyp);

        _gobTest->SetPos(&rc);
    }

    return fTrue;
}

bool KhelloApp::FCmdPattern(PCMD cmd)
{
    _gobBackground->TogglePattern();
    return fTrue;
}

bool KhelloApp::FCmdDissolve(PCMD cmd)
{
    this->SetGft(kgftDissolve, 0, 2000, pvNil, kacrBlack);
    return fTrue;
}

void MessageLogGob::Draw(PGNV pgnv, RC *prcClip)
{
    pgnv->FillRc(prcClip, kacrLtGray);

    // Set font
    pgnv->SetOnn(0);

    STN stnText;

    // Get the height of a line
    RC rcText;
    pgnv->GetRcFromRgch(&rcText, PszLit("test"), 4);
    const int32_t dypText = rcText.ypBottom;

    int32_t istnLastCmd = _istnNextCmd - 1;
    if (istnLastCmd < 0)
    {
        istnLastCmd = kcstnCmdMax - 1;
    }

    // Draw each line in reverse order
    int32_t istn = istnLastCmd;
    for (int32_t cact = 0; cact < kcstnCmdMax; cact++)
    {
        ACR acr;
        if (istn == istnLastCmd)
        {
            acr = kacrBlue;
        }
        else
        {
            acr = kacrBlack;
        }

        pgnv->DrawStn(&stnLastCmd[istn], 0, dypText * cact, acr);

        istn--;
        if (istn < 0)
        {
            istn = kcstnCmdMax - 1;
        }
    }
}

bool MessageLogGob::FCmdMouseMove(PCMD_MOUSE cmd)
{
    STN stnCmd;
    stnCmd.FFormatSz(PszLit("cidMouseMove: xp: %d yp: %d cact: %d grfcust: %d"), cmd->xp, cmd->yp, cmd->cact,
                     cmd->grfcust);

    for (int32_t ibit = 0; ibit < 4; ibit++)
    {
        if ((1 << ibit) & cmd->grfcust)
        {
            stnCmd.FAppendSz(PszLit(" "));
            stnCmd.FAppendSz(mpfcustpsz[ibit]);
        }
    }

    AddCmd(stnCmd);
    return fTrue;
}

bool MessageLogGob::FCmdRollOff(PCMD cmd)
{
    AddCmd(PszLit("cidRollOff"));
    return fFalse;
}

bool MessageLogGob::FCmdTrackMouse(PCMD_MOUSE pcmd)
{
    STN stnCmd;
    stnCmd.FFormatSz(PszLit("cidTrackMouse: xp: %d yp: %d cact: %d grfcust: %d"), pcmd->xp, pcmd->yp, pcmd->cact,
                     pcmd->grfcust);

    for (int32_t ibit = 0; ibit < 4; ibit++)
    {
        if ((1 << ibit) & pcmd->grfcust)
        {
            stnCmd.FAppendSz(PszLit(" "));
            stnCmd.FAppendSz(mpfcustpsz[ibit]);
        }
    }

    AddCmd(stnCmd);
    return fFalse;
}

void MessageLogGob::AddCmd(STN stnCmd)
{
    stnLastCmd[_istnNextCmd].FFormatSz(PszLit("%d: %s"), TsCurrent(), &stnCmd);
    _istnNextCmd = (_istnNextCmd + 1) % kcstnCmdMax;

    // mark this region as invalid: will be repainted soon
    InvalRc(pvNil, kginMark);
}

void BackgroundGob::Draw(PGNV pgnv, RC *prcClip)
{
    if (_fPattern)
    {
        pgnv->FillRcApt(prcClip, &vaptGray, kacrBlack, kacrWhite);
    }
    else
    {
        pgnv->FillRc(prcClip, kacrBlack);
    }
}

void BackgroundGob::TogglePattern()
{
    _fPattern = FPure(!_fPattern);
    InvalRc(pvNil, kginMark);
}
