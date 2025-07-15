/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL base application class.

***************************************************************************/
#include <iostream>
#include "frame.h"
#include "fcntl.h"
#include "stdio.h"
#include "io.h"

ASSERTNAME

WIG vwig;

// Number of milliseconds to wait for events before doing idle processing
const uint32_t kdtsIdleTimer = 1;

// Number of milliseconds for a double click
// FUTURE: Get this from the system
const uint32_t kdtsDoubleClick = 500;

// Window size
const uint32_t kdxpWindow = 640;
const uint32_t kdypWindow = 480;

static SDL_Cursor *vpsdlcursWait = pvNil;
static SDL_Cursor *vpsdlcursArrow = pvNil;

/***************************************************************************
    WinMain for any frame work app. Sets up vwig and calls FrameMain.
***************************************************************************/
int WINAPI WinMain(HINSTANCE hinst, HINSTANCE hinstPrev, LPSTR pszs, int wShow)
{
    vwig.hinst = hinst;
    vwig.hinstPrev = hinstPrev;
    vwig.pszCmdLine = GetCommandLine();
    vwig.wShow = wShow;
    vwig.lwThreadMain = LwThreadCur();
#ifdef DEBUG
    APPB::CreateConsole();
#endif
    FrameMain();
    SDL_Quit();
    return 0;
}

/*
 * Create debug console window and wire up std streams
 */
void APPB::CreateConsole()
{
    // This is only needed on Windows
#ifdef WIN32
    if (!AllocConsole())
    {
        return;
    }

    FILE *fDummy;
    freopen_s(&fDummy, "CONOUT$", "w", stdout);
    freopen_s(&fDummy, "CONOUT$", "w", stderr);
    freopen_s(&fDummy, "CONIN$", "r", stdin);
    std::cout.clear();
    std::clog.clear();
    std::cerr.clear();
    std::cin.clear();
#endif // WIN32
}

/***************************************************************************
    Shutdown immediately.
***************************************************************************/
void APPB::Abort(void)
{
    // Cleanup SDL
    SDL_Quit();
    exit(1);
}

/***************************************************************************
    Do OS specific initialization.
***************************************************************************/
bool APPB::_FInitOS(void)
{
    AssertThis(0);
    STN stnApp;
    PCSZ pszAppWndCls = PszLit("APP");
    int ret = 0, sdlerr = 0;

    // get the app name
    GetStnAppName(&stnApp);

    // Initialize SDL
    ret = SDL_Init(SDL_INIT_EVERYTHING);
    Assert(ret >= 0, "SDLInit failed");
    if (ret < 0)
    {
        Warn(SDL_GetError());
        return fFalse;
    }

    U8SZ u8szApp;
    stnApp.GetUtf8Sz(u8szApp);
    int32_t xpWindow = SDL_WINDOWPOS_UNDEFINED;
    int32_t ypWindow = SDL_WINDOWPOS_UNDEFINED;
    SDL_Window *wnd = SDL_CreateWindow(u8szApp, xpWindow, ypWindow, kdxpWindow, kdypWindow, 0);
    Assert(wnd != pvNil, "no window returned from SDL_CreateWindow");
    if (wnd == pvNil)
    {
        return fFalse;
    }

    // Create a renderer
    SDL_Renderer *rdr = SDL_CreateRenderer(wnd, -1, 0);
    Assert(rdr != pvNil, "no renderer created from SDL_CreateRenderer");

    vwig.hwndApp = wnd;

    // FUTURE: Turn this off when Win32 stuff is removed
    SDL_EventState(SDL_SYSWMEVENT, SDL_ENABLE);

    return fTrue;
}

/***************************************************************************
    Get the next event from the OS event queue. Return true iff it's a
    real event (not just an idle type event).
***************************************************************************/
bool APPB::_FGetNextEvt(PEVT pevt)
{
    AssertThis(0);
    AssertVarMem(pevt);

    bool fHasEvt = fFalse;
    if (SDL_WaitEventTimeout(pevt, kdtsIdleTimer))
    {
        // If this is a mouse move event, process it and return fFalse so idle processing is performed.
        if (pevt->type == SDL_MOUSEMOTION)
        {
            _DispatchEvt(pevt);
        }
        else
        {
            // We have an event to process
            fHasEvt = fTrue;
        }
    }

    return fHasEvt;
}

/***************************************************************************
    The given GOB is tracking the mouse. See if there are any relevant
    mouse events in the system event queue. Fill in *ppt with the location
    of the mouse relative to pgob. Also ensure that GrfcustCur() will
    return the correct mouse state.
***************************************************************************/
void APPB::TrackMouse(PGOB pgob, PT *ppt)
{
    AssertThis(0);
    AssertPo(pgob, 0);
    AssertVarMem(ppt);

    // TODO: review

    int ret = 0;
    int xp, yp;
    int32_t grfcust = 0;

    SDL_Event evt;

    // Check if there are any mouse move events. Other events will be enqueued for processing later.
    SDL_PumpEvents();
    ret = SDL_PeepEvents(&evt, 1, SDL_GETEVENT, SDL_MOUSEMOTION, SDL_MOUSEMOTION);
    if (ret == 1)
    {
        // Found a mouse move event
        xp = evt.motion.x;
        yp = evt.motion.y;
        if ((evt.motion.state & SDL_BUTTON_LMASK) != 0)
        {
            grfcust |= fcustMouse;
        }
    }
    else if (ret == 0)
    {
        // No mouse move events: just get the current position instead
        int state = SDL_GetMouseState(&xp, &yp);
        if (state & SDL_BUTTON(1))
        {
            grfcust |= fcustMouse;
        }
    }
    else
    {
        // SDL_PeepEvents Failed
        Assert(ret >= 0, "SDL_PeepEvents shouldn't return an error");
        xp = 0;
        yp = 0;
    }

    ppt->xp = xp;
    ppt->yp = yp;
    pgob->MapPt(ppt, cooHwnd, cooLocal);

    _grfcust = grfcust;
}

/***************************************************************************
    Dispatch an OS level event to someone that knows what to do with it.
***************************************************************************/
void APPB::_DispatchEvt(PEVT pevt)
{
    AssertThis(0);
    AssertVarMem(pevt);

    CMD cmd;
    PGOB pgob;
    int xp, yp;
    PT pt;

    switch (pevt->type)
    {
    case SDL_QUIT:
        if (pvNil != vpcex)
            vpcex->EnqueueCid(cidQuit);
        break;
    case SDL_TEXTINPUT:
        if (pvNil != vpcex)
        {
            Assert(pevt->text.type == SDL_TEXTINPUT, "incorrect message type");

            // Convert text input from UTF-8
            static_assert((SDL_TEXTINPUTEVENT_TEXT_SIZE + 1) < kcchTotUtf8Sz,
                          "UTF8 string type not big enough for SDL text input");
            U8SZ u8szInput;
            ClearPb(u8szInput, SIZEOF(u8szInput));
            CopyPb(pevt->text.text, u8szInput, SDL_TEXTINPUTEVENT_TEXT_SIZE);

            STN stnInput;
            stnInput.SetUtf8Sz(u8szInput);

            // Create cidKey events for each character
            for (int32_t ich = 0; ich < stnInput.Cch(); ich++)
            {
                achar ch = stnInput.Psz()[ich];
                if (ch == chNil)
                {
                    break;
                }

                CMD_KEY cmd;
                ClearPb(&cmd, SIZEOF(cmd));

                cmd.ch = ch;
                cmd.cact = 1;
                cmd.cid = cidKey;

                vpcex->EnqueueCmd((PCMD)&cmd);
            }
        }
        ResetToolTip();
        break;
    case SDL_KEYDOWN:
        if (_FTranslateKeyEvt(pevt, (PCMD_KEY)&cmd) && pvNil != vpcex)
            vpcex->EnqueueCmd(&cmd);
        ResetToolTip();
        break;
    case SDL_SYSWMEVENT:
        if (pevt->syswm.msg->msg.win.msg == WM_COMMAND)
        {
            int32_t lwT = pevt->syswm.msg->msg.win.wParam;
            if (!FIn(lwT, wcidMinApp, wcidLimApp))
                break;

            // TODO: menu bar support
            // if (pvNil != vpmubCur)
            // vpmubCur->EnqueueWcid(lwT);
            else if (pvNil != vpcex)
                vpcex->EnqueueCid(lwT);
        }
        break;
    case SDL_MOUSEBUTTONDOWN:
        ResetToolTip();

        xp = pevt->button.x;
        yp = pevt->button.y;

        // Find GOB at this point
        // TODO: instead of PgobScreen(), find the gob by SDL window

        pgob = GOB::PgobScreen()->PgobFromPt(xp, yp, &pt);

        if (pvNil != pgob)
        {
            int32_t ts;

            // compute the multiplicity of the click - don't use Windows'
            // guess, since it can be wrong for our GOBs. It's even wrong
            // at the HWND level! (Try double-clicking the maximize button).
            ts = pevt->common.timestamp;
            if (_pgobMouse == pgob && FIn(ts - _tsMouse, 0, kdtsDoubleClick))
            {
                _cactMouse++;
            }
            else
                _cactMouse = 1;
            _tsMouse = ts;
            if (_pgobMouse != pgob && pvNil != _pgobMouse)
            {
                AssertPo(_pgobMouse, 0);
                vpcex->EnqueueCid(cidRollOff, _pgobMouse);
            }
            _pgobMouse = pgob;
            _xpMouse = klwMax;

            // GrfcustCur() may not always have fcustMouse set when the message is processed.
            int32_t grfcust = GrfcustCur();
            grfcust |= fcustMouse;
            pgob->MouseDown(pt.xp, pt.yp, _cactMouse, grfcust);
        }
        else
            _pgobMouse = pvNil;
        break;
    default:
        // ignore event
        break;
    }
}

/***************************************************************************
    Translate an OS level key down event to a CMD. This returns false if
    the key maps to a menu item.
***************************************************************************/
bool APPB::_FTranslateKeyEvt(PEVT pevt, PCMD_KEY pcmd)
{
    AssertThis(0);
    AssertVarMem(pevt);
    AssertVarMem(pcmd);

    EVT evt;
    int32_t grfcust = 0;
    ClearPb(&evt, SIZEOF(evt));
    ClearPb(pcmd, SIZEOF(*pcmd));
    pcmd->cid = cidKey;

    if (pevt->type == SDL_KEYDOWN)
    {
        pcmd->vk = pevt->key.keysym.sym;
        pcmd->ch = ChLit(0);

        grfcust &= ~kgrfcustUser;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_CTRL)
            grfcust |= fcustCmd;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_SHIFT)
            grfcust |= fcustShift;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_ALT)
            grfcust |= fcustOption;
        pcmd->grfcust = grfcust;
        pcmd->cact = 1;
    }

    return fTrue;
}

/***************************************************************************
    Look at the next system event and if it's a key, fill in the *pcmd with
    the relevant info.
***************************************************************************/
bool APPB::FGetNextKeyFromOsQueue(PCMD_KEY pcmd)
{
    AssertThis(0);
    AssertVarMem(pcmd);

    // TODO: implement

    return fFalse;
}

/***************************************************************************
    Flush user generated events from the system event queue.
***************************************************************************/
void APPB::FlushUserEvents(uint32_t grfevt)
{
    AssertThis(0);
    EVT evt;
    int ret = 0;
    SDL_Event sdlevt;
    ClearPb(&sdlevt, SIZEOF(sdlevt));

    if (grfevt & fevtMouse)
    {
        // Flush mouse events
        while ((ret = SDL_PeepEvents(&sdlevt, 1, SDL_GETEVENT, SDL_MOUSEMOTION, SDL_MOUSEWHEEL)) > 0)
        {
            // do nothing
        }
    }
    if (grfevt & fevtKey)
    {
        // Flush keyboard events
        while ((ret = SDL_PeepEvents(&sdlevt, 1, SDL_GETEVENT, SDL_KEYDOWN, SDL_TEXTEDITING_EXT)) > 0)
        {
            // do nothing
        }
    }
}

#ifdef DEBUG
/***************************************************************************
    Debug initialization.
***************************************************************************/
bool APPB::_FInitDebug(void)
{
    AssertThis(0);
    return fTrue;
}

MUTX _mutxAssert;

/***************************************************************************
    The assert proc. Returning true breaks into the debugger.
***************************************************************************/
bool APPB::FAssertProcApp(PSZS pszsFile, int32_t lwLine, PSZS pszsMsg, void *pv, int32_t cb)
{
    const int32_t kclwChain = 10;
    STN stn0, stn1, stn2;
    int tmc;
    PCSZ psz;
    int32_t cact;
    int32_t *plw;
    int32_t ilw;
    int32_t rglw[kclwChain];

    _mutxAssert.Enter();

    if (_fInAssert)
    {
        _mutxAssert.Leave();
        return fFalse;
    }

    _fInAssert = fTrue;

    // build the main assert message with file name and line number
    if (pszsMsg == pvNil || *pszsMsg == 0)
        psz = PszLit("Assert (%s line %d)");
    else
    {
        psz = PszLit("Assert (%s line %d): %s");
        stn2.SetSzs(pszsMsg);
    }
    if (pvNil != pszsFile)
        stn1.SetSzs(pszsFile);
    else
        stn1 = PszLit("Some Header file");
    stn0.FFormatSz(psz, &stn1, lwLine, &stn2);

#if defined(WIN) && defined(IN_80386)
    // call stack - follow the EBP chain....
    __asm { mov plw,ebp }
    for (ilw = 0; ilw < kclwChain; ilw++)
    {
        if (pvNil == plw || IsBadReadPtr(plw, 2 * size(int32_t)) || *plw <= (int32_t)plw)
        {
            rglw[ilw] = 0;
            plw = pvNil;
        }
        else
        {
            rglw[ilw] = plw[1];
            plw = (int32_t *)*plw;
        }
    }

    for (cact = 0; cact < 2; cact++)
    {
        // format data
        if (pv != pvNil && cb > 0)
        {
            uint8_t *pb = (uint8_t *)pv;
            int32_t cbT = cb;
            int32_t ilw;
            int32_t lw;
            STN stnT;

            stn2.SetNil();
            for (ilw = 0; ilw < 20 && cb >= 4; cb -= 4, pb += 4, ++ilw)
            {
                CopyPb(pb, &lw, 4);
                stnT.FFormatSz(PszLit("%08x "), lw);
                stn2.FAppendStn(&stnT);
            }
            if (ilw < 20 && cb > 0)
            {
                lw = 0;
                CopyPb(pb, &lw, cb);
                if (cb <= 2)
                {
                    stnT.FFormatSz(PszLit("%04x"), lw);
                }
                else
                {
                    stnT.FFormatSz(PszLit("%08x"), lw);
                }
                stn2.FAppendStn(&stnT);
            }
        }
        else
            stn2.SetNil();

        if (cact == 0)
        {
            pv = rglw;
            cb = size(rglw);
            stn1 = stn2;
        }
    }
#endif // WIN && IN_80386

#ifdef WIN
    OutputDebugString(stn0.Psz());
    OutputDebugString(PszLit("\n"));

    if (stn1.Cch() > 0)
    {
        OutputDebugString(stn1.Psz());
        OutputDebugString(PszLit("\n"));
    }
    if (stn2.Cch() > 0)
    {
        OutputDebugString(stn2.Psz());
        OutputDebugString(PszLit("\n"));
    }
#else  // !WIN
    U8SZ u8szT;
    stn0.GetUtf8Sz(u8szT);
    fprintf(stderr, "%s\n", u8szT);
    if (stn1.Cch() > 0)
    {
        stn1.GetUtf8Sz(u8szT);
        fprintf(stderr, "%s\n", u8szT);
    }
    if (stn2.Cch() > 0)
    {
        stn2.GetUtf8Sz(u8szT);
        fprintf(stderr, "%s\n", u8szT);
    }
#endif // WIN

    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn1);
    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn2);

    U8SZ u8szMessage;
    stn0.GetUtf8Sz(u8szMessage);

    SDL_MessageBoxButtonData rgbutton[3];
    FillPb(rgbutton, SIZEOF(rgbutton), 0);

    rgbutton[0].buttonid = 0;
    rgbutton[0].text = "Ignore";
    rgbutton[1].buttonid = 1;
    rgbutton[1].text = "Debugger";
    rgbutton[2].buttonid = 2;
    rgbutton[2].text = "Abort";

    SDL_MessageBoxData data = {0};
    data.buttons = rgbutton;
    data.numbuttons = 3;
    data.message = u8szMessage;
    data.flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_ERROR;
    data.title = "Assertion Failure";

    (void)SDL_ShowMessageBox(&data, &tmc);

    _fInAssert = fFalse;
    _mutxAssert.Leave();

    switch (tmc)
    {
    case 0:
        // ignore
        return fFalse;

    case 1:
        // break into debugger
        return fTrue;

    case 2:
        // abort
        Abort(); // shouldn't return
        Debugger();
        break;
    }

    return fFalse;
}
#endif // DEBUG

/***************************************************************************
    Put an alert up. Return which button was hit. Returns tYes for yes
    or ok; tNo for no; tMaybe for cancel.
***************************************************************************/
tribool APPB::TGiveAlertSz(const PCSZ psz, int32_t bk, int32_t cok)
{
    AssertThis(0);
    AssertSz(psz);

    int32_t ibutton = 0;
    SDL_MessageBoxButtonData rgbutton[3];
    ClearPb(rgbutton, SIZEOF(rgbutton));

    // OK/Yes button
    if (bk == bkYesNo || bk == bkYesNoCancel)
    {
        rgbutton[ibutton].text = "Yes";
    }
    else
    {
        Assert(bk == bkOk || bk == bkOkCancel, "invalid bk");
        rgbutton[ibutton].text = "OK";
    }
    rgbutton[ibutton].buttonid = tYes;
    ibutton++;

    // No button
    if (bk == bkYesNo || bk == bkYesNoCancel)
    {
        rgbutton[ibutton].text = "No";
        rgbutton[ibutton].buttonid = tNo;
        ibutton++;
    }

    // Cancel button
    if (bk == bkOkCancel || bk == bkYesNoCancel)
    {
        rgbutton[ibutton].text = "Cancel";
        rgbutton[ibutton].buttonid = tMaybe;
        ibutton++;
    }

    uint32_t flags = 0;
    switch (cok)
    {
    case cokInformation:
        flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_INFORMATION;
        break;
    case cokExclamation:
        flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_WARNING;
        break;
    case cokStop:
        flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_ERROR;
        break;
    default:
        flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_INFORMATION;
        break;
    }

    // Convert message to UTF-8
    U8SZ u8szMessage;
    STN stnMessage;
    stnMessage.SetSz(psz);
    stnMessage.GetUtf8Sz(u8szMessage);

    SDL_MessageBoxData data;
    ClearPb(&data, sizeof(data));
    data.buttons = rgbutton;
    data.numbuttons = ibutton;
    data.message = u8szMessage;
    data.flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_ERROR;
    data.title = "3D Movie Maker";

    int buttonid = tNo;
    (void)SDL_ShowMessageBox(&data, &buttonid);

    if (buttonid != tYes && buttonid != tNo && buttonid != tMaybe)
    {
        buttonid = tNo;
    }

    return (tribool)buttonid;
}

/***************************************************************************
    Hide the cursor
***************************************************************************/
void APPB::HideCurs(void)
{
    AssertThis(0);

    SDL_ShowCursor(SDL_DISABLE);
}

/***************************************************************************
    Show the cursor
***************************************************************************/
void APPB::ShowCurs(void)
{
    AssertThis(0);

    SDL_ShowCursor(SDL_ENABLE);
}

/***************************************************************************
    Warp the cursor to (xpScreen, ypScreen)
***************************************************************************/
void APPB::PositionCurs(int32_t xpScreen, int32_t ypScreen)
{
    AssertThis(0);

    SDL_WarpMouseGlobal(xpScreen, ypScreen);
}

/***************************************************************************
    Make sure the current cursor is being used by the system.
***************************************************************************/
void APPB::RefreshCurs(void)
{
    AssertThis(0);

    bool fBusy = (_cactLongOp > 0);

    PCURS *ppcurs = fBusy ? &_pcursWait : &_pcurs;

    if (pvNil != *ppcurs)
        (*ppcurs)->Set();
    else
    {
        SDL_Cursor *psdlcurs = pvNil;
        if (fBusy)
        {
            if (vpsdlcursWait == pvNil)
            {
                vpsdlcursWait = SDL_CreateSystemCursor(SDL_SystemCursor::SDL_SYSTEM_CURSOR_WAIT);
                Assert(vpsdlcursWait != pvNil, "Could not create wait cursor");
            }
            psdlcurs = vpsdlcursWait;
        }
        else
        {
            if (vpsdlcursArrow == pvNil)
            {
                vpsdlcursArrow = SDL_CreateSystemCursor(SDL_SystemCursor::SDL_SYSTEM_CURSOR_ARROW);
                Assert(vpsdlcursArrow != pvNil, "Could not create arrow cursor");
            }
            psdlcurs = vpsdlcursArrow;
        }
        SDL_SetCursor(psdlcurs);
    }
}
