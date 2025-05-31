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

// TODO: Remove this
WIG vwig;

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
    return 0;
}

/*
 * Create debug console window and wire up std streams
 */
void APPB::CreateConsole()
{
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
}

/***************************************************************************
    Shutdown immediately.
***************************************************************************/
void APPB::Abort(void)
{
    // TODO: SDL
    // FatalAppExit(0, PszLit("Fatal Error Termination"));
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

    // Create main app window
    // TODO: replace starting position with SDL_WINDOWPOS_UNDEFINED
    // TODO: set starting size properly

    SDL_Window *wnd = SDL_CreateWindow(stnApp.Psz(), 64, 64, 640, 480, 0);
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

    SDL_Event evt = {0};
    PGOB pgob = pvNil;
    bool fHasEvt = fTrue;

    *pevt = {0};

    if (SDL_PollEvent(&evt) != 0)
    {
        // handle this separately
        if (evt.type == SDL_QUIT)
        {
            if (pvNil != vpcex)
                vpcex->EnqueueCid(cidQuit);
        }
        else
        {
            *pevt = evt;
        }
    }
    else
    {
        // No events: do idle processing instead
        fHasEvt = fFalse;
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
            ts = GetMessageTime();
            if (_pgobMouse == pgob && FIn(ts - _tsMouse, 0, GetDoubleClickTime()))
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

        // TODO: translate ch
        pcmd->ch = ChLit(0);

        grfcust &= ~kgrfcustUser;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_CTRL)
            grfcust |= fcustCmd;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_SHIFT)
            grfcust |= fcustShift;
        if (pevt->key.keysym.mod & SDL_Keymod::KMOD_ALT)
            grfcust |= fcustOption;
        // TODO: can't map fcustMouse: used in a few places
        pcmd->grfcust = grfcust;
        pcmd->cact = pevt->key.repeat; // TODO: number of repeats, not just "repeat"
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

    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn1);
    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn2);

    SDL_MessageBoxButtonData rgbutton[3];
    FillPb(rgbutton, SIZEOF(rgbutton), 0);

    rgbutton[0].buttonid = 0;
    rgbutton[0].text = PszLit("Ignore");
    rgbutton[1].buttonid = 1;
    rgbutton[1].text = PszLit("Debugger");
    rgbutton[2].buttonid = 2;
    rgbutton[2].text = PszLit("Abort");

    SDL_MessageBoxData data = {0};
    data.buttons = rgbutton;
    data.numbuttons = 3;
    data.message = stn0.Psz();
    data.flags = SDL_MessageBoxFlags::SDL_MESSAGEBOX_ERROR;
    data.title = PszLit("Assertion Failure");

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

    RawRtn();
    return tNo;
}
