/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL font routines.

***************************************************************************/
#include "frame.h"
ASSERTNAME

#include "gfx.h"
#include "fontsdl.h"

/***************************************************************************
    Assert the validity of the font list.
***************************************************************************/
void NTL::AssertValid(uint32_t grf)
{
    NTL_PAR::AssertValid(0);
    AssertPo(_pgst, 0);
}

/***************************************************************************
    Mark memory for the font table.
***************************************************************************/
void NTL::MarkMem(void)
{
    AssertValid(0);
    NTL_PAR::MarkMem();

    RawRtn();
}

/***************************************************************************
    Initialize the font table.
***************************************************************************/
bool NTL::FInit(void)
{
    RawRtn();
    return fFalse;
}

/***************************************************************************
    Return true iff the font is a fixed pitch font.
***************************************************************************/
bool NTL::FFixedPitch(int32_t onn)
{
    RawRtn();
    return fFalse;
}