/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL menu support

***************************************************************************/
#include "frame.h"
ASSERTNAME

PMUB vpmubCur;
RTCLASS(MUB)

/***************************************************************************
    Destructor - make sure vpmubCur is not this mub.
***************************************************************************/
MUB::~MUB(void)
{
    if (vpmubCur == this)
        vpmubCur = pvNil;
}

/***************************************************************************
    Static method to load and set a new menu bar.
***************************************************************************/
PMUB MUB::PmubNew(uint32_t ridMenuBar)
{
    PMUB pmub;

    if ((pmub = NewObj MUB) == pvNil)
        return pvNil;

    pmub->Set();

    return pmub;
}

/***************************************************************************
    Make this the current menu bar.
***************************************************************************/
void MUB::Set(void)
{
    vpmubCur = this;
}

/***************************************************************************
    Make sure the menu's are clean - ie, items are enabled/disabled/marked
    correctly.  Called immediately before dropping the menus.
***************************************************************************/
void MUB::Clean(void)
{
    // TODO: implement
}

/***************************************************************************
    Adds an item identified by the given list cid, long parameter
    and string.
***************************************************************************/
bool MUB::FAddListCid(int32_t cid, uintptr_t lw0, PSTN pstn)
{
    AssertThis(0);
    AssertPo(pstn, 0);

    // TODO: implement

    return fTrue;
}

/***************************************************************************
    Removes all items identified by the given list cid, and long parameter
    or string.  If pstn is non-nil, it is used to find the item.
    If pstn is nil, lw0 is used to identify the item.
***************************************************************************/
bool MUB::FRemoveListCid(int32_t cid, uintptr_t lw0, PSTN pstn)
{
    AssertThis(0);
    AssertNilOrPo(pstn, 0);

    // TODO: implement

    return fTrue;
}

/***************************************************************************
    Removes all items identified by the given list cid.
***************************************************************************/
bool MUB::FRemoveAllListCid(int32_t cid)
{
    AssertThis(0);

    // TODO: implement

    return fTrue;
}

/***************************************************************************
    Changes the long parameter and the menu text associated with a menu
    list item.  If pstnOld is non-nil, it is used to find the item.
    If pstnOld is nil, lwOld is used to identify the item.  In either case
    lwNew is set as the new long parameter and if pstnNew is non-nil,
    it is used as the new menu item text.
***************************************************************************/
bool MUB::FChangeListCid(int32_t cid, uintptr_t lwOld, PSTN pstnOld, uintptr_t lwNew, PSTN pstnNew)
{
    AssertThis(0);
    AssertNilOrPo(pstnOld, 0);
    AssertNilOrPo(pstnNew, 0);

    // TODO: implement

    return fTrue;
}

#ifdef DEBUG
/***************************************************************************
    Mark mem used by the menu bar.
***************************************************************************/
void MUB::MarkMem(void)
{
    AssertThis(0);
    MUB_PAR::MarkMem();
}
#endif // DEBUG
