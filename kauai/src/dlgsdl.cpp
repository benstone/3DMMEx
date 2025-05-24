/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL dialog support

***************************************************************************/
#include "frame.h"
ASSERTNAME

bool DLG::_FInit(void)
{
    RawRtn();

    return fFalse;
}

/***************************************************************************
    Actually put up the dialog and don't return until it comes down.
    Returns the idit that dismissed the dialog.  Returns ivNil on failure.
***************************************************************************/
int32_t DLG::IditDo(int32_t iditFocus)
{
    RawRtn();
    return ivNil;
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
