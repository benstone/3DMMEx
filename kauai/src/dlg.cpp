/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Standard dialogs.

***************************************************************************/
#include "frame.h"
ASSERTNAME

RTCLASS(DLG)

/***************************************************************************
    Constructor for a dialog object.
***************************************************************************/
DLG::DLG(int32_t rid) : GG(SIZEOF(DIT))
{
    _rid = rid;
}

/***************************************************************************
    Static method to create a new DLG.  Does NewObj then calls _FInit.
***************************************************************************/
PDLG DLG::PdlgNew(int32_t rid, PFNDLG pfn, void *pv)
{
    PDLG pdlg;

    if ((pdlg = NewObj DLG(rid)) == pvNil)
        return pvNil;

    pdlg->_pfn = pfn;
    pdlg->_pv = pv;

    if (!pdlg->_FInit())
        ReleasePpo(&pdlg);

    return pdlg;
}

/***************************************************************************
    Get the values for [iditMin, iditLim) from the actual dialog and put
    them in the GGDIT.
***************************************************************************/
bool DLG::FGetValues(int32_t iditMin, int32_t iditLim)
{
    AssertThis(0);
    int32_t idit;
    DIT dit;
    int32_t lw;
    STN stn;

    AssertIn(iditMin, 0, iditLim);
    if (_pgob == pvNil)
    {
        Bug("why are you calling this when the dialog doesn't exist?");
        return fFalse;
    }

    iditLim = LwMin(iditLim, IvMac());
    for (idit = iditMin; idit < iditLim; idit++)
    {
        GetDit(idit, &dit);
        switch (dit.ditk)
        {
        case ditkCheckBox:
            lw = _FGetCheckBox(idit);
            goto LPutLw;

        case ditkRadioGroup:
            lw = _LwGetRadioGroup(idit);
        LPutLw:
            PutRgb(idit, 0, SIZEOF(lw), &lw);
            break;

        case ditkEditText:
        case ditkCombo:
            _GetEditText(idit, &stn);
            if (!FPutStn(idit, &stn))
                return fFalse;
            break;
        }
    }

    return fTrue;
}

/***************************************************************************
    Set the values for [iditMin, iditLim) from the GGDIT into the actual
    dialog.
***************************************************************************/
void DLG::SetValues(int32_t iditMin, int32_t iditLim)
{
    AssertThis(0);
    int32_t idit;
    DIT dit;
    STN stn;
    int32_t lw;
    int32_t cb, cbT, ib;
    uint8_t *prgb;

    if (_pgob == pvNil)
    {
        Bug("why are you calling this when the dialog doesn't exist?");
        return;
    }

    iditLim = LwMin(iditLim, IvMac());
    for (idit = iditMin; idit < iditLim; idit++)
    {
        GetDit(idit, &dit);
        switch (dit.ditk)
        {
        case ditkCheckBox:
            GetRgb(idit, 0, SIZEOF(lw), &lw);
            _SetCheckBox(idit, lw);
            break;

        case ditkRadioGroup:
            GetRgb(idit, 0, SIZEOF(lw), &lw);
            _SetRadioGroup(idit, lw);
            break;

        case ditkEditText:
            GetStn(idit, &stn);
            _SetEditText(idit, &stn);
            break;

        case ditkCombo:
            _ClearList(idit);
            cb = Cb(idit);
            if (cb <= 0)
            {
                stn.SetNil();
                _SetEditText(idit, &stn);
                break;
            }
            prgb = (uint8_t *)PvLock(idit);
            if (!stn.FSetData(prgb, cb, &cbT))
            {
                Bug("bad combo item");
                cbT = cb;
            }
            _SetEditText(idit, &stn);
            for (ib = cbT; ib < cb;)
            {
                if (!stn.FSetData(prgb + ib, cb - ib, &cbT))
                {
                    BugVar("bad combo item", &ib);
                    break;
                }
                ib += cbT;
                _FAddToList(idit, &stn);
            }
            Unlock();
            break;
        }
    }
}

/***************************************************************************
    Get the item number from a system item number.
***************************************************************************/
int32_t DLG::IditFromSit(int32_t sit)
{
    int32_t idit;
    DIT dit;

    for (idit = IvMac(); idit-- != 0;)
    {
        GetDit(idit, &dit);
        if (sit >= dit.sitMin && sit < dit.sitLim)
            return idit;
    }
    return ivNil;
}

/***************************************************************************
    Calls the PFNDLG (if not nil) to notify of a change.  PFNDLG should
    return true if the dialog should be dismissed.  The PFNDLG is free
    to change *pidit.  If a nil PFNDLG was specified (in PdlgNew),
    this returns true (dismisses the dialog) on any button hit.
***************************************************************************/
bool DLG::_FDitChange(int32_t *pidit)
{
    if (pvNil == _pfn)
    {
        DIT dit;

        if (ivNil == *pidit)
            return fFalse;

        GetDit(*pidit, &dit);
        return dit.ditk == ditkButton;
    }

    return (*_pfn)(this, pidit, _pv);
}

/***************************************************************************
    Get the stn (for an edit item).
***************************************************************************/
void DLG::GetStn(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    AssertPo(pstn, 0);
    int32_t cb;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkEditText == dit.ditk || dit.ditk == ditkCombo, "not a text item or combo");
#endif // DEBUG

    cb = Cb(idit);
    if (cb <= 0)
        pstn->SetNil();
    else
    {
        AssertDo(pstn->FSetData(PvLock(idit), cb, &cb), 0);
        Unlock();
    }
}

/***************************************************************************
    Put the stn into the DLG.
***************************************************************************/
bool DLG::FPutStn(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    AssertPo(pstn, 0);
    DIT dit;
    int32_t cbOld, cbNew;

    GetDit(idit, &dit);
    cbOld = Cb(idit);
    cbNew = pstn->CbData();
    switch (dit.ditk)
    {
    default:
        Bug("not a text item or combo");
        return fFalse;

    case ditkEditText:
        if (cbOld != cbNew && !FPut(idit, cbNew, pvNil))
            return fFalse;
        break;

    case ditkCombo:
        if (cbOld > 0)
        {
            STN stn;

            if (!stn.FSetData(PvLock(idit), cbOld, &cbOld))
            {
                Bug("why did setting the data fail?");
                cbOld = Cb(idit);
            }
            Unlock();
        }
        if (cbOld > cbNew)
            DeleteRgb(idit, 0, cbOld - cbNew);
        else if (cbOld < cbNew && !FInsertRgb(idit, 0, cbNew - cbOld, pvNil))
            return fFalse;
        break;
    }

    pstn->GetData(PvLock(idit));
    Unlock();
    return fTrue;
}

/***************************************************************************
    Get the value of a radio group.
***************************************************************************/
int32_t DLG::LwGetRadio(int32_t idit)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    int32_t lw;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkRadioGroup == dit.ditk, "not a radio group");
#endif // DEBUG

    GetRgb(idit, 0, SIZEOF(int32_t), &lw);
    return lw;
}

/***************************************************************************
    Set the value of the radio group.
***************************************************************************/
void DLG::PutRadio(int32_t idit, int32_t lw)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkRadioGroup == dit.ditk, "not a radio group");
    AssertIn(lw, 0, dit.sitLim - dit.sitMin);
#endif // DEBUG

    PutRgb(idit, 0, SIZEOF(int32_t), &lw);
}

/***************************************************************************
    Get the value of a check box.
***************************************************************************/
bool DLG::FGetCheck(int32_t idit)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    int32_t lw;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkCheckBox == dit.ditk, "not a check box");
#endif // DEBUG

    GetRgb(idit, 0, SIZEOF(int32_t), &lw);
    return lw;
}

/***************************************************************************
    Set the value of a check box item.
***************************************************************************/
void DLG::PutCheck(int32_t idit, bool fOn)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    int32_t lw;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkCheckBox == dit.ditk, "not a check box");
#endif // DEBUG

    lw = FPure(fOn);
    PutRgb(idit, 0, SIZEOF(int32_t), &lw);
}

/***************************************************************************
    Get the indicated edit item from the dialog and convert it to a long.
    If the string is empty, sets *plw to zero and sets *pfEmpty (if pfEmpty
    is not nil) and returns false.  If the string doesn't parse as a number,
    returns false.
***************************************************************************/
bool DLG::FGetLwFromEdit(int32_t idit, int32_t *plw, bool *pfEmpty)
{
    AssertThis(0);
    AssertVarMem(plw);
    AssertNilOrVarMem(pfEmpty);
    STN stn;

    GetStn(idit, &stn);
    if (0 == stn.Cch())
    {
        if (pvNil != pfEmpty)
            *pfEmpty = fTrue;
        *plw = 0;
        return fFalse;
    }
    if (pvNil != pfEmpty)
        *pfEmpty = fFalse;
    if (!stn.FGetLw(plw, 0))
    {
        TrashVar(plw);
        return fFalse;
    }
    return fTrue;
}

/***************************************************************************
    Put the long into the indicated edit item (in decimal).
***************************************************************************/
bool DLG::FPutLwInEdit(int32_t idit, int32_t lw)
{
    AssertThis(0);
    STN stn;

    stn.FFormatSz(PszLit("%d"), lw);
    return FPutStn(idit, &stn);
}

/***************************************************************************
    Add the string to the given list item.
***************************************************************************/
bool DLG::FAddToList(int32_t idit, PSTN pstn)
{
    AssertThis(0);
    int32_t cb, cbTot;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkCombo == dit.ditk, "not a combo");
#endif // DEBUG

    cbTot = Cb(idit);
    if (cbTot == 0)
    {
        STN stn;

        stn.SetNil();
        if (!FPut(idit, cbTot = stn.CbData(), pvNil))
            return fFalse;
        stn.GetData(PvLock(idit));
        Unlock();
    }
    cb = pstn->CbData();
    if (!FInsertRgb(idit, cbTot, cb, pvNil))
        return fFalse;

    pstn->GetData(PvAddBv(PvLock(idit), cbTot));
    Unlock();
    return fTrue;
}

/***************************************************************************
    Empty the list of options for the list item.
***************************************************************************/
void DLG::ClearList(int32_t idit)
{
    AssertThis(0);
    AssertIn(idit, 0, IvMac());
    int32_t cbOld, cbNew;
    STN stn;

#ifdef DEBUG
    DIT dit;
    GetDit(idit, &dit);
    Assert(ditkCombo == dit.ditk, "not a combo");
#endif // DEBUG

    cbOld = Cb(idit);
    if (cbOld <= 0)
        return;

    if (!stn.FSetData(PvLock(idit), cbOld, &cbNew))
    {
        Bug("why did setting the data fail?");
        cbNew = 0;
    }
    Unlock();
    if (cbOld > cbNew)
        DeleteRgb(idit, cbNew, cbOld - cbNew);
}
