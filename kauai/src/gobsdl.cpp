/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Graphic object class.

***************************************************************************/
#include "frame.h"
ASSERTNAME

PGOB GOB::_pgobScreen;

/***************************************************************************
    Create the screen gob.  If fgobEnsureHwnd is set, ensures that the
    screen gob has an OS window associated with it.
***************************************************************************/
bool GOB::FInitScreen(uint32_t grfgob, int32_t ginDef)
{
    PGOB pgob;
    GCB gcb(khidScreen, pvNil);

    switch (ginDef)
    {
    case kginDraw:
    case kginMark:
    case kginSysInval:
        _ginDefGob = ginDef;
        break;
    }

    if (pvNil == (pgob = NewObj GOB(&gcb)))
        return fFalse;
    Assert(pgob == _pgobScreen, 0);

    if (!pgob->FAttachHwnd(vwig.hwndApp))
        return fFalse;

    return fTrue;
}

/***************************************************************************
    Make the GOB a wrapper for the given system window.
***************************************************************************/
bool GOB::FAttachHwnd(KWND hwnd)
{
    if (_hwnd != kwndNil)
    {
        ReleasePpo(&_pgpt);
        // don't destroy the hwnd - the caller must do that
        _hwnd = kwndNil;
    }
    if (hwnd != kwndNil)
    {
        if (pvNil == (_pgpt = GPT::PgptNewHwnd(hwnd)))
            return fFalse;
        _hwnd = hwnd;
        SetRcFromHwnd();
    }
    return fTrue;
}

/***************************************************************************
    Find the GOB associated with the given hwnd (if there is one).
***************************************************************************/
PGOB GOB::PgobFromHwnd(KWND hwnd)
{
    // NOTE: we used to use SetProp and GetProp for this, but profiling
    // indicated that GetProp is very slow.
    Assert(hwnd != hNil, "nil hwnd");
    GTE gte;
    uint32_t grfgte;
    PGOB pgob;

    gte.Init(_pgobScreen, fgteNil);
    while (gte.FNextGob(&pgob, &grfgte, fgteNil))
    {
        if (pgob->_hwnd == hwnd)
            return pgob;
    }
    return pvNil;
}

/***************************************************************************
    Return the active MDI window.
***************************************************************************/
KWND GOB::HwndMdiActive(void)
{
    RawRtn();
    return kwndNil;
}

/***************************************************************************
    Creates a new MDI window and returns it.  This is normally then
    attached to a gob.
***************************************************************************/
KWND GOB::_HwndNewMdi(PSTN pstnTitle)
{
    AssertPo(pstnTitle, 0);
    RawRtn();

    return kwndNil;
}

/***************************************************************************
    Destroy an hwnd.
***************************************************************************/
void GOB::_DestroyHwnd(KWND hwnd)
{
    if (hwnd == vwig.hwndApp)
    {
        Bug("can't destroy app window");
        return;
    }

    SDL_DestroyWindow((SDL_Window *)hwnd);
}

/***************************************************************************
    Gets the current mouse location in this gob's coordinates (if ppt is
    not nil) and determines if the mouse button is down (if pfDown is
    not nil).
***************************************************************************/
void GOB::GetPtMouse(PT *ppt, bool *pfDown)
{
    AssertThis(0);

    int xp = 0, yp = 0;
    int mouseState = SDL_GetMouseState(&xp, &yp);

    if (ppt != pvNil)
    {
        PGOB pgob;

        for (pgob = this; pgob != pvNil && pgob->_hwnd == hNil; pgob = pgob->_pgobPar)
        {
            xp -= pgob->_rcCur.xpLeft;
            yp -= pgob->_rcCur.ypTop;
        }

        ppt->xp = xp;
        ppt->yp = yp;
    }
    if (pfDown != pvNil)
        *pfDown = mouseState & SDL_BUTTON(SDL_BUTTON_LEFT);
}

/***************************************************************************
    Makes sure the GOB is clean (no update is pending).
***************************************************************************/
void GOB::Clean(void)
{
    AssertThis(0);
    // TODO: update?
}

/***************************************************************************
    Set the window name.
***************************************************************************/
void GOB::SetHwndName(PSTN pstn)
{
    if (kwndNil == _hwnd)
    {
        Bug("GOB doesn't have an hwnd");
        return;
    }
    if (pvNil != vpmubCur)
    {
        // TODO: window chooser: not used in 3DMM
        RawRtn();
    }

    U8SZ u8szTitle;
    pstn->GetUtf8Sz(u8szTitle);
    SDL_SetWindowTitle((SDL_Window *)_hwnd, u8szTitle);
}

/***************************************************************************
    If this is one of our MDI windows, make it the active MDI window.
***************************************************************************/
void GOB::MakeHwndActive(KWND hwnd)
{
    RawRtn();
}
