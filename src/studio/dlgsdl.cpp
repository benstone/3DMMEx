/***************************************************************************
    Author: Ben Stone
    Project: Socrates
    Reviewed:

    3DMM SDL Dialog support

***************************************************************************/
#include <cstdio>
#include "frame.h"
ASSERTNAME

#include "utestres.h"

bool DLG::_FInit(void)
{
    bool fRet = fFalse;
    const int32_t kcdit = 2;

    // We only support certain dialog boxes
    if (_rid != dlidAbnormalExit && _rid != dlidInitFailed && _rid != dlidInitFailedOOM && _rid != dlidGenericErrorBox)
        goto LFail;

    // Allocate some dialog items to allow setting text in error messages
    if (!FEnsureSpace(kcdit, SIZEOF(int32_t), fgrpNil))
        goto LFail;

    DIT dit;
    ClearPb(&dit, SIZEOF(dit));
    dit.ditk = ditkEditText;

    for (int32_t idit = 0; idit < kcdit; idit++)
    {
        if (!FInsert(idit, 0, pvNil, &dit))
            goto LFail;
    }

    fRet = fTrue;

LFail:
    return fRet;
}

/***************************************************************************
    Actually put up the dialog and don't return until it comes down.
    Returns the idit that dismissed the dialog.  Returns ivNil on failure.
***************************************************************************/
int32_t DLG::IditDo(int32_t iditFocus)
{
    STN stnMessage;
    STN stnT;
    U8SZ u8szTitle;
    U8SZ u8szMessage;

    switch (_rid)
    {
    case dlidAbnormalExit:
        stnMessage = PszLit("3D Movie Maker ended unexpectedly. Attempting to clean up.");
        break;

    case dlidInitFailed:
        stnMessage = PszLit("3D Movie Maker could not start.");
        break;

    case dlidInitFailedOOM:
        stnMessage = PszLit("3D Movie Maker could not start because there is not enough memory available.");
        break;

    case dlidGenericErrorBox:
        stnT = PszLit("(unknown)");
        GetStn(1, &stnT);
        stnMessage.FFormatSz(PszLit("3D Movie Maker could not start because the following function failed: %s"), &stnT);
        break;

    default:
        Bug("Unimplemented dialog box type");
        stnMessage.FFormatSz(PszLit("Unimplemented dialog box type: %d"), _rid);
        break;
    }

    vpappb->GetStnAppName(&stnT);
    stnT.GetUtf8Sz(u8szTitle);

    stnMessage.GetUtf8Sz(u8szMessage);
    if (SDL_ShowSimpleMessageBox(SDL_MESSAGEBOX_ERROR, u8szTitle, u8szMessage, pvNil) != 0)
    {
        Bug(SDL_GetError());
        // Cannot show a message box, so we will print to stderr instead.
        fprintf(stderr, "%s\n", u8szMessage);
    }

    // This should return the ID of the dialog box item that dismissed the dialog.
    // However, we don't have any dialog box item IDs, so we will just return non-zero to indicate success.
    return 1;
}

/***************************************************************************
    Make the given item the "focused" item and select its contents.  The
    item should be a text item or combo item.
***************************************************************************/
void DLG::SelectDit(int32_t idit)
{
    RawRtn();
}

/***************************************************************************
    Get the value of a radio group.
***************************************************************************/
int32_t DLG::_LwGetRadioGroup(int32_t idit)
{
    RawRtn();
    return 0;
}

/***************************************************************************
    Change a radio group value.
***************************************************************************/
void DLG::_SetRadioGroup(int32_t idit, int32_t lw)
{
    RawRtn();
}

/***************************************************************************
    Returns the current value of a check box.
***************************************************************************/
bool DLG::_FGetCheckBox(int32_t idit)
{
    RawRtn();
    return fFalse;
}

/***************************************************************************
    Invert the value of a check box.
***************************************************************************/
void DLG::_InvertCheckBox(int32_t idit)
{
    RawRtn();
}

/***************************************************************************
    Set the value of a check box.
***************************************************************************/
void DLG::_SetCheckBox(int32_t idit, bool fOn)
{
    RawRtn();
}

/***************************************************************************
    Get the text from an edit control or combo.
***************************************************************************/
void DLG::_GetEditText(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);

    RawRtn();
}

/***************************************************************************
    Set the text in an edit control or combo.
***************************************************************************/
void DLG::_SetEditText(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);

    RawRtn();
}

/***************************************************************************
    Add a string to a combo item.
***************************************************************************/
bool DLG::_FAddToList(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);
    RawRtn();
    return fFalse;
}

/***************************************************************************
    Empty the list portion of the combo item.
***************************************************************************/
void DLG::_ClearList(int32_t idit)
{
    AssertThis(0);
    RawRtn();
}
