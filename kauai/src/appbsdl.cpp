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

    // get the app name
    GetStnAppName(&stnApp);

    // TODO: SDL
    RawRtn();

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

    RawRtn();

    return fFalse;
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

    RawRtn();
}

/***************************************************************************
    Dispatch an OS level event to someone that knows what to do with it.
***************************************************************************/
void APPB::_DispatchEvt(PEVT pevt)
{
    AssertThis(0);
    AssertVarMem(pevt);

    RawRtn();
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

    RawRtn();

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
    RawRtn();

    return fFalse;
}

/***************************************************************************
    Flush user generated events from the system event queue.
***************************************************************************/
void APPB::FlushUserEvents(uint32_t grfevt)
{
    AssertThis(0);
    EVT evt;

    RawRtn();
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

// passes the strings to the assert dialog proc
STN *_rgpstn[3];

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

    _rgpstn[0] = &stn0;
    _rgpstn[1] = &stn1;
    _rgpstn[2] = &stn2;

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

    // can't use a dialog - it may cause grid - lock
    int32_t sid;
    uint32_t grfmb;

    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn1);
    stn0.FAppendSz(PszLit("\n"));
    stn0.FAppendStn(&stn2);

    // TODO: Show an SDL dialog box
    printf("ASSERTION FAILURE!\n");
    printf("%s", stn0.Psz());

    // always break into debugger for now
    tmc = 1;

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
