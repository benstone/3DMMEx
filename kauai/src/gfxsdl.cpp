/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL specific graphics routines.

***************************************************************************/
#include "frame.h"
ASSERTNAME

/***************************************************************************
    Static method to flush any pending graphics operations.
***************************************************************************/
void GPT::Flush(void)
{
    RawRtn();
}

/***************************************************************************
    Static method to set the current color table.
    While using fpalIdentity the following cautions apply:

        1) The following indexes are reserved by the system, so shouldn't be used:
            { 0, 1, 3, 15, 255 } (Mac)
            { 0 - 9; 246 - 255 } (Win).
        2) While we're in the background, RGB values may get mapped to
            the wrong indexes, so the colors will change when we move
            to the foreground.  The solution is to always use indexed
            based color while using fForceOnSystem.
        3) This should only be called when we are the foreground app.

***************************************************************************/
void GPT::SetActiveColors(PGL pglclr, uint32_t grfpal)
{
    RawRtn();
}

/***************************************************************************
    Destructor for a port.
***************************************************************************/
GPT::~GPT(void)
{
    ReleasePpo(&_pregnClip);
}

/***************************************************************************
    Static method to create an offscreen port.
***************************************************************************/
PGPT GPT::PgptNewOffscreen(RC *prc, int32_t cbitPixel)
{
    AssertVarMem(prc);
    Assert(!prc->FEmpty(), "empty rc for offscreen");
    RawRtn();

    return pvNil;
}

/***************************************************************************
    If this is an offscreen bitmap, return the pointer to the pixels and
    optionally get the bounds. Must balance with a call to Unlock().
***************************************************************************/
byte *GPT::PrgbLockPixels(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    RawRtn();
    return pvNil;
}

/***************************************************************************
    If this is an offscreen bitmap, return the number of bytes per row.
***************************************************************************/
int32_t GPT::CbRow(void)
{
    AssertThis(0);

    RawRtn();
    return 0;
}

/***************************************************************************
    If this is an offscreen bitmap, return the number of bits per pixel.
***************************************************************************/
int32_t GPT::CbitPixel(void)
{
    AssertThis(0);

    RawRtn();
    return 0;
}

/***************************************************************************
    Static method to create a PICT and its an associated GPT.
    This should be balanced with a call to PpicRelease().
***************************************************************************/
PGPT GPT::PgptNewPic(RC *prc)
{
    AssertVarMem(prc);
    Assert(!prc->FEmpty(), "empty rectangle for metafile GPT");

    RawRtn();
    return pvNil;
}

/***************************************************************************
    Closes a metafile based GPT and returns the picture produced from
    drawing into the GPT.
***************************************************************************/
PPIC GPT::PpicRelease(void)
{
    AssertThis(0);

    RawRtn();
    return pvNil;
}

/***************************************************************************
    Fill or frame a rectangle.
***************************************************************************/
void GPT::DrawRcs(RCS *prcs, GDD *pgdd)
{
    AssertThis(0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Hilite the rectangle by reversing white and the system hilite color.
***************************************************************************/
void GPT::HiliteRcs(RCS *prcs, GDD *pgdd)
{
    AssertThis(0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);

    Warn("HiliteRcs not implemented yet");
    DrawRcs(prcs, pgdd);
}

/***************************************************************************
    Fill or frame an oval.
***************************************************************************/
void GPT::DrawOval(RCS *prcs, GDD *pgdd)
{
    AssertThis(0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);
    PFNDRW pfn;

    Warn("DrawOval not implemented yet");
    DrawRcs(prcs, pgdd);
}

/***************************************************************************
    Fill or frame a polygon.
***************************************************************************/
void GPT::DrawPoly(HQ hqoly, GDD *pgdd)
{
    AssertThis(0);
    AssertHq(hqoly);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Draw a line.
***************************************************************************/
void GPT::DrawLine(PTS *ppts1, PTS *ppts2, GDD *pgdd)
{
    AssertThis(0);
    AssertVarMem(ppts1);
    AssertVarMem(ppts2);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Low level routine to fill/frame a shape.
***************************************************************************/
void GPT::_Fill(void *pv, GDD *pgdd, PFNDRW pfn)
{
    RawRtn();
}

/***************************************************************************
    Scroll the given rectangle.
***************************************************************************/
void GPT::ScrollRcs(RCS *prcs, int32_t dxp, int32_t dyp, GDD *pgdd)
{
    AssertThis(0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Draw the text.
***************************************************************************/
void GPT::DrawRgch(const achar *prgch, int32_t cch, PTS pts, GDD *pgdd, DSF *pdsf)
{
    AssertThis(0);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgch, cch);
    AssertVarMem(pgdd);
    AssertPo(pdsf, 0);

    RawRtn();
}

/***************************************************************************
    Get the bounding text rectangle (in port coordinates).
***************************************************************************/
void GPT::GetRcsFromRgch(RCS *prcs, const achar *prgch, int32_t cch, PTS pts, DSF *pdsf)
{
    AssertThis(0);
    AssertVarMem(prcs);
    AssertIn(cch, 0, kcbMax);
    AssertPvCb(prgch, cch);
    AssertPo(pdsf, 0);

    RawRtn();
}

/***************************************************************************
    Lock the pixels for the port if this is an offscreen PixMap.
    Must be balanced by a call to Unlock.
***************************************************************************/
void GPT::Lock(void)
{
    Assert(_cactLock >= 0, "invalid lock count");

    _cactLock++;
    RawRtn();
}

/***************************************************************************
    Unlock the pixels for the port if this is an offscreen PixMap.
***************************************************************************/
void GPT::Unlock(void)
{
    Assert(_cactLock > 0, "calling unlock when not locked!");

    _cactLock--;
    RawRtn();
}

/***************************************************************************
    Copy bits from pgptSrc to this GPT.
***************************************************************************/
void GPT::CopyPixels(PGPT pgptSrc, RCS *prcsSrc, RCS *prcsDst, GDD *pgdd)
{
    AssertThis(0);
    AssertThis(0);
    AssertPo(pgptSrc, 0);
    AssertVarMem(prcsSrc);
    AssertVarMem(prcsDst);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Draw the picture in the given rectangle.
***************************************************************************/
void GPT::DrawPic(PPIC ppic, RCS *prcs, GDD *pgdd)
{
    AssertThis(0);
    AssertPo(ppic, 0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);

    // not implemented: not used in 3DMM
    RawRtn();
}

/***************************************************************************
    Draw the masked bitmap in the given rectangle with reference point
    *ppts.  pgdd->prcsClip is the clipping rectangle.
***************************************************************************/
void GPT::DrawMbmp(PMBMP pmbmp, RCS *prcs, GDD *pgdd)
{
    AssertThis(0);
    AssertPo(pmbmp, 0);
    AssertVarMem(prcs);
    AssertVarMem(pgdd);

    RawRtn();
}

/***************************************************************************
    Set the color table of an offscreen GPT.
***************************************************************************/
void GPT::SetOffscreenColors(PGL pglclr)
{
    AssertThis(0);
    AssertNilOrPo(pglclr, 0);

    // TODO: used in scene thumbnail generation
    RawRtn();
}

/***************************************************************************
    Static method to create a new pglclr containing the current palette.
***************************************************************************/
PGL GPT::PglclrGetPalette(void)
{
    RawRtn();
    return pvNil;
}

#ifdef DEBUG
/***************************************************************************
    Test the validity of the port.
***************************************************************************/
void GPT::AssertValid(uint32_t grf)
{
    GPT_PAR::AssertValid(0);
    AssertIn(_cactRef, 1, kcbMax);
}

/***************************************************************************
    Static method to mark static GPT memory.
***************************************************************************/
void GPT::MarkStaticMem(void)
{
}
#endif // DEBUG

/***************************************************************************
    Create a new rectangular region.  If prc is nil, the region will be
    empty.
***************************************************************************/
bool FCreateRgn(HRGN *phrgn, RC *prc)
{
    AssertVarMem(phrgn);
    AssertNilOrVarMem(prc);
    RCS rcs;

    if (pvNil == prc)
        ClearPb(&rcs, SIZEOF(rcs));
    else
        rcs = *prc;

    // TODO: refactor to remove dependency on Windows types
    *phrgn = CreateRectRgnIndirect(&rcs);
    return *phrgn != hNil;
}

/***************************************************************************
    Free the region and set *phrgn to nil.
***************************************************************************/
void FreePhrgn(HRGN *phrgn)
{
    AssertVarMem(phrgn);

    if (*phrgn != hNil)
    {
        DeleteObject(*phrgn);
        *phrgn = hNil;
    }
}

/***************************************************************************
    Make the region rectangular.  If prc is nil, the region will be empty.
    If *phrgn is hNil, creates the region.  *phrgn may change even if
    *phrgn is not nil.
***************************************************************************/
bool FSetRectRgn(HRGN *phrgn, RC *prc)
{
    AssertVarMem(phrgn);
    AssertNilOrVarMem(prc);

    if (hNil == *phrgn)
        return FCreateRgn(phrgn, prc);
    if (pvNil == prc)
        return SetRectRgn(*phrgn, 0, 0, 0, 0);
    return SetRectRgn(*phrgn, prc->xpLeft, prc->ypTop, prc->xpRight, prc->ypBottom);
}

/***************************************************************************
    Put the union of hrgnSrc1 and hrgnSrc2 into hrgnDst.  The parameters
    need not be distinct.  Returns success/failure.
***************************************************************************/
bool FUnionRgn(HRGN hrgnDst, HRGN hrgnSrc1, HRGN hrgnSrc2)
{
    Assert(hNil != hrgnDst, "null dst");
    Assert(hNil != hrgnSrc1, "null src1");
    Assert(hNil != hrgnSrc2, "null src2");

    return ERROR != CombineRgn(hrgnDst, hrgnSrc1, hrgnSrc2, RGN_OR);
}

/***************************************************************************
    Put the intersection of hrgnSrc1 and hrgnSrc2 into hrgnDst.  The parameters
    need not be distinct.  Returns success/failure.
***************************************************************************/
bool FIntersectRgn(HRGN hrgnDst, HRGN hrgnSrc1, HRGN hrgnSrc2, bool *pfEmpty)
{
    Assert(hNil != hrgnDst, "null dst");
    Assert(hNil != hrgnSrc1, "null src1");
    Assert(hNil != hrgnSrc2, "null src2");
    long lw;

    lw = CombineRgn(hrgnDst, hrgnSrc1, hrgnSrc2, RGN_AND);
    if (ERROR == lw)
        return fFalse;
    if (pvNil != pfEmpty)
        *pfEmpty = (lw == NULLREGION);
    return fTrue;
}

/***************************************************************************
    Put hrgnSrc - hrgnSrcSub into hrgnDst.  The parameters need not be
    distinct.  Returns success/failure.
***************************************************************************/
bool FDiffRgn(HRGN hrgnDst, HRGN hrgnSrc, HRGN hrgnSrcSub, bool *pfEmpty)
{
    Assert(hNil != hrgnDst, "null dst");
    Assert(hNil != hrgnSrc, "null src");
    Assert(hNil != hrgnSrcSub, "null srcSub");
    long lw;

    lw = CombineRgn(hrgnDst, hrgnSrc, hrgnSrcSub, RGN_DIFF);
    if (ERROR == lw)
        return fFalse;
    if (pvNil != pfEmpty)
        *pfEmpty = (lw == NULLREGION);
    return fTrue;
}

/***************************************************************************
    Determine if the region is rectangular and put the bounding rectangle
    in *prc (if not nil).
***************************************************************************/
bool FRectRgn(HRGN hrgn, RC *prc)
{
    Assert(hNil != hrgn, "null rgn");
    RCS rcs;
    bool fRet;

    fRet = GetRgnBox(hrgn, &rcs) != COMPLEXREGION;
    if (pvNil != prc)
        *prc = rcs;
    return fRet;
}

/***************************************************************************
    Return true iff the region is empty.
***************************************************************************/
bool FEmptyRgn(HRGN hrgn, RC *prc)
{
    Assert(hNil != hrgn, "null rgn");
    RCS rcs;
    bool fRet;

    fRet = GetRgnBox(hrgn, &rcs) == NULLREGION;
    if (pvNil != prc)
        *prc = rcs;
    return fRet;
}
/***************************************************************************
    Return true iff the two regions are equal.
***************************************************************************/
bool FEqualRgn(HRGN hrgn1, HRGN hrgn2)
{
    Assert(hNil != hrgn1, "null rgn1");
    Assert(hNil != hrgn2, "null rgn2");
    return EqualRgn(hrgn1, hrgn2);
}
