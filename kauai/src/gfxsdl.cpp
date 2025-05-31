/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    SDL specific graphics routines.

***************************************************************************/
#include "frame.h"
ASSERTNAME

// Palette used for drawing 8-bit images
static SDL_Palette *_pal = pvNil;

/***************************************************************************
    Static method to flush any pending graphics operations.
***************************************************************************/
void GPT::Flush(void)
{
    // Use the flush call to repaint the screen
    PGOB pgobScreen = GOB::PgobScreen();
    if (pgobScreen != pvNil)
    {
        PGPT pgpt = pgobScreen->Pgpt();
        if (pgpt != pvNil)
        {
            pgpt->Flip();
        }
    }
}

/***************************************************************************
    These are the standard windows static colors. We use these on
    non-palettized displays.
***************************************************************************/
const SDL_Color _rgsdlcWin[20] = {
    {0, 0, 0, 0},          {0x80, 0, 0, 0},       {0, 0x80, 0, 0},       {0x80, 0x80, 0, 0},    {0, 0, 0x80, 0},
    {0x80, 0, 0x80, 0},    {0, 0x80, 0x80, 0},    {0xC0, 0xC0, 0xC0, 0}, {0xC0, 0xDC, 0xC0, 0}, {0xA6, 0xCA, 0xF0, 0},
    {0xFF, 0xFB, 0xF0, 0}, {0xA0, 0xA0, 0xA4, 0}, {0x80, 0x80, 0x80, 0}, {0xFF, 0, 0, 0},       {0, 0xFF, 0, 0},
    {0xFF, 0xFF, 0, 0},    {0, 0, 0xFF, 0},       {0xFF, 0, 0xFF, 0},    {0, 0xFF, 0xFF, 0},    {0xFF, 0xFF, 0xFF, 0},
};

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
    int ret = 0;
    const int32_t kcsdlc = 256;
    SDL_Color rgsdlc[kcsdlc];
    int32_t cclr;

    AssertNilOrPo(pglclr, 0);

    // Allocate a palette
    if (_pal == pvNil)
    {
        _pal = SDL_AllocPalette(kcsdlc);
        if (_pal == pvNil)
        {
            Assert(_pal != pvNil, "Could not allocate palette");
            return;
        }
    }

    // Copy standard colors
    CopyPb(_rgsdlcWin, rgsdlc, 10 * SIZEOF(_rgsdlcWin[0]));
    CopyPb(_rgsdlcWin + 10, rgsdlc + 246, 10 * SIZEOF(_rgsdlcWin[0]));

    // Copy colors from the pglcr if given
    if (pglclr != pvNil)
    {
        int32_t cclr = pglclr->IvMac();
        int32_t ipeLim = LwMin(cclr, 246);
        for (int32_t ipe = 10; ipe < ipeLim; ipe++)
        {
            CLR clr;
            SDL_Color sdlc;

            pglclr->Get(ipe, &clr);
            sdlc.r = clr.bRed;
            sdlc.g = clr.bGreen;
            sdlc.b = clr.bBlue;
            sdlc.a = 0;
            rgsdlc[ipe] = sdlc;
        }
    }

    // Add colours to the palette
    ret = SDL_SetPaletteColors(_pal, rgsdlc, 0, kcsdlc);
    Assert(ret == 0, "SDL_SetPaletteColors failed");

    vcactRealize++;
}

PGPT GPT::PgptNew(SDL_Window *wnd, int cbitPixel, bool fOffscreen, int dxp, int dyp)
{
    Assert(pvNil != wnd, "Null SDL window");
    PGPT pgpt;
    int ret;

    if (pvNil == (pgpt = NewObj GPT))
        return pvNil;

    pgpt->_wnd = wnd;
    pgpt->_renderer = SDL_GetRenderer(wnd);
    Assert(pgpt->_renderer != pvNil, "no renderer");
    pgpt->_fOffscreen = fOffscreen;

    // get drawable size
    if (!fOffscreen)
    {
        AssertDo(SDL_GetRendererOutputSize(pgpt->_renderer, &dxp, &dyp) == 0, "GetRendererOutputSize failed");
    }
    Assert(dxp != 0, "dxp must be > 0");
    Assert(dyp != 0, "dyp must be > 0");

    // Create a surface that is used for updating the texture
    pgpt->_surface = SDL_CreateRGBSurface(0, dxp, dyp, cbitPixel, 0, 0, 0, 0);
    Assert(pgpt->_surface != pvNil, "CreateRGBSurface failed");

    // If this is a 8-bit surface, use the global palette
    if (cbitPixel == 8)
    {
        // TODO: REFACTOR: Split out into an "EnsurePalette" function
        if (_pal == pvNil)
        {
            _pal = SDL_AllocPalette(256);
        }

        ret = SDL_SetSurfacePalette(pgpt->_surface, _pal);
        Assert(ret == 0, "SDL_SetSurfacePalette failed");
    }

    // Create a texture that is used for rendering
    pgpt->_texture =
        SDL_CreateTexture(pgpt->_renderer, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STREAMING, dxp, dyp);
    Assert(pgpt->_texture, "SDL_CreateTexture failed");

    pgpt->InvalidateTexture();

    return pgpt;
}

/***************************************************************************
    Static method to create a new GPT for a window.
***************************************************************************/
PGPT GPT::PgptNewHwnd(KWND hwnd)
{
    Assert(kwndNil != hwnd, "Null hwnd");
    Assert(pvNil != ((SDL_Window *)hwnd), "Not an SDL window");
    HDC hdc;
    PGPT pgpt;
    if (pvNil == (pgpt = PgptNew((SDL_Window *)hwnd, 32, fFalse, 0, 0)))
    {
        return pvNil;
    }

    AssertPo(pgpt, 0);
    return pgpt;
}

// TODO: refactor Portfolio to remove dependency on this function
PGPT GPT::PgptNew(HDC hdc)
{
    RawRtn();
    return pvNil;
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
    RCS rcs;
    PGPT pgpt;
    int ret;

    if (cbitPixel == 24)
        cbitPixel = 32;

    // assert that cbitPixel is in {1,2,4,8,16,32}
    AssertIn(cbitPixel, 1, 33);
    AssertVar((cbitPixel & (cbitPixel - 1)) == 0, "bad cbitPixel value", &cbitPixel);

    // Create a GPT
    pgpt = PgptNew((SDL_Window *)vwig.hwndApp, cbitPixel, fTrue, prc->Dxp(), prc->Dyp());
    Assert(pgpt != pvNil, "couldn't allocate GPT");

    return pgpt;
}

/**
 * Mark the texture as invalidated
 **/
void GPT::InvalidateTexture()
{
    _fSurfaceDirty = fTrue;
}

void GPT::UpdateTexture()
{
    if (_fSurfaceDirty == fTrue)
    {
        // Copy the bitmap from the surface to the texture
        void *pixels = pvNil;
        int pitch;

        Assert(_texture != pvNil, "no texture");
        AssertDo(SDL_LockTexture(_texture, NULL, &pixels, &pitch) == 0, "Could not lock texture");
        AssertDo(SDL_ConvertPixels(_surface->w, _surface->h, _surface->format->format, _surface->pixels,
                                   _surface->pitch, SDL_PIXELFORMAT_ARGB8888, pixels, pitch) == 0,
                 "Could not convert pixels");
        SDL_UnlockTexture(_texture);

        _fSurfaceDirty = fFalse;
    }
}

void GPT::DumpBitmap(STN *stnBmp)
{
    int ret = SDL_SaveBMP(_surface, stnBmp->Psz());
    Assert(ret == 0, "SDL_SaveBMP failed");
}

/***************************************************************************
    If this is an offscreen bitmap, return the pointer to the pixels and
    optionally get the bounds. Must balance with a call to Unlock().
***************************************************************************/
byte *GPT::PrgbLockPixels(RC *prc)
{
    AssertThis(0);
    AssertNilOrVarMem(prc);

    Lock();

    if (prc != pvNil)
    {
        prc->xpLeft = 0;
        prc->ypTop = 0;
        prc->xpRight = _surface->w;
        prc->ypBottom = _surface->h;
    }

    return (byte *)_surface->pixels;
}

/***************************************************************************
    If this is an offscreen bitmap, return the number of bytes per row.
***************************************************************************/
int32_t GPT::CbRow(void)
{
    AssertThis(0);
    return _surface->w * _surface->format->BytesPerPixel;
}

/***************************************************************************
    If this is an offscreen bitmap, return the number of bits per pixel.
***************************************************************************/
int32_t GPT::CbitPixel(void)
{
    AssertThis(0);

    return _surface->format->BitsPerPixel;
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
    PFNDRW pfn;

    // TODO: error handling

    ACR acrFore;
    acrFore = pgdd->acrFore;

    if (acrFore == kacrClear)
    {
        // clear: do nothing
        return;
    }

    // Convert color to SDL color
    SDL_Color clrFore = acrFore._SDLColor();

    // Set clipping
    if (pgdd->prcsClip != pvNil)
    {
        SDL_Rect sdlRectClip;
        sdlRectClip.x = pgdd->prcsClip->left;
        sdlRectClip.w = pgdd->prcsClip->right - pgdd->prcsClip->left;
        sdlRectClip.y = pgdd->prcsClip->top;
        sdlRectClip.h = pgdd->prcsClip->bottom - pgdd->prcsClip->top;

        SDL_SetClipRect(_surface, &sdlRectClip);
    }

    SDL_Rect sdlRect;
    sdlRect.x = prcs->left;
    sdlRect.y = prcs->top;
    sdlRect.w = prcs->right - prcs->left;
    sdlRect.h = prcs->bottom - prcs->top;

    if ((pgdd->grfgdd & fgddFrame) || (pgdd->grfgdd & fgddPattern))
    {
        // TODO: support fgddPattern
        // not supported yet
        // RawRtn();
    }
    else
    {
        // Fill rectangle
        SDL_FillRect(_surface, &sdlRect, SDL_MapRGB(_surface->format, clrFore.r, clrFore.g, clrFore.b));
    }

    SDL_SetClipRect(_surface, pvNil);
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

SDL_Color ACR::_SDLColor()
{
    SDL_Color sdlColor;
    int iclr;
    ClearPb(&sdlColor, SIZEOF(sdlColor));

    // Check what type of color this is
    byte colortype = B3Lw(_lu);
    switch (colortype)
    {
    case kbIndexAcr:
        iclr = B0Lw(_lu);
        if (FIn(iclr, 0, _pal->ncolors))
        {
            sdlColor = _pal->colors[iclr];
        }
        else
        {
            Bug("invalid palette index");
        }
        break;
    case kbRgbAcr:
        sdlColor.r = B2Lw(_lu);
        sdlColor.g = B1Lw(_lu);
        sdlColor.b = B0Lw(_lu);
        break;
    case kbSpecialAcr:
        if (_lu == kluAcrClear)
        {
            sdlColor.a = 255;
        }
        else if (_lu == kluAcrInvert)
        {
            Bug("invert not implemented yet");
        }
        else
        {
            Bug("unknown special acr");
        }
        break;
    default:
        Bug("unsupported color type");
        break;
    }

    return sdlColor;
}

void GPT::_SetTextProps(TTF_Font *ttfFont, DSF *pdsf)
{
    AssertPo(pdsf, 0);
    Assert(ttfFont != pvNil, "no font");

    int fontStyle = 0;

    if (ttfFont == pvNil || pdsf == pvNil)
    {
        return;
    }

    // TODO: Check return values of TTF_* functions
    TTF_SetFontSize(ttfFont, pdsf->dyp);

    // Map DSF alignment flags to SDL wrapped align flags
    const int _mptahfwa[] = {TTF_WRAPPED_ALIGN_LEFT, TTF_WRAPPED_ALIGN_CENTER, TTF_WRAPPED_ALIGN_RIGHT};
    AssertIn(pdsf->tah, 0, SIZEOF(_mptahfwa) / SIZEOF(_mptahfwa[0]));
    TTF_SetFontWrappedAlign(ttfFont, _mptahfwa[pdsf->tah]);

    if (pdsf->grfont & fontBold)
    {
        fontStyle |= TTF_STYLE_BOLD;
    }
    if (pdsf->grfont & fontItalic)
    {
        fontStyle |= TTF_STYLE_ITALIC;
    }
    if (pdsf->grfont & fontUnderline)
    {
        fontStyle |= TTF_STYLE_UNDERLINE;
    }
    if (pdsf->grfont & fontBoxed)
    {
        Bug("not implemented");
    }
    TTF_SetFontStyle(ttfFont, fontStyle);
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

    ACR acrFore, acrBack;
    CLR clr;
    RCS rcs;
    RCS *prcs = pvNil;
    SDL_Surface *surRendered = pvNil;
    STN stnText;
    SDL_Color sdlcFore, sdlcBack;
    TTF_Font *ttfFont = pvNil;

    acrFore = pgdd->acrFore;
    acrBack = pgdd->acrBack;

    Assert(acrFore != kacrClear, "why are you rendering clear text?");
    Assert(acrFore != kacrInvert, "not supported yet");
    Assert(acrBack != kacrInvert, "not supported yet");

    // Map colors
    sdlcBack = acrBack._SDLColor();
    sdlcFore = acrFore._SDLColor();

    // Get dimensions of font
    GetRcsFromRgch(&rcs, prgch, cch, pts, pdsf);

    // TODO: error handling

    // Find the font
    ttfFont = vntl.TtfFontFromOnn(pdsf->onn);
    _SetTextProps(ttfFont, pdsf);

    SDL_Rect sdlRect;
    sdlRect.x = rcs.left;
    sdlRect.y = rcs.top;
    sdlRect.w = rcs.right - rcs.left;
    sdlRect.h = rcs.bottom - rcs.top;

    // Set clipping
    if (pgdd->prcsClip != pvNil)
    {
        SDL_Rect sdlRectClip;
        sdlRectClip.x = pgdd->prcsClip->left;
        sdlRectClip.w = pgdd->prcsClip->right - pgdd->prcsClip->left;
        sdlRectClip.y = pgdd->prcsClip->top;
        sdlRectClip.h = pgdd->prcsClip->bottom - pgdd->prcsClip->top;

        SDL_SetClipRect(_surface, &sdlRectClip);
    }

    // Draw background rect
    if ((acrBack != kacrClear) && (acrBack != kacrInvert))
    {
        int sdlcolor = SDL_MapRGB(_surface->format, sdlcBack.r, sdlcBack.g, sdlcBack.b);
        SDL_FillRect(_surface, &sdlRect, sdlcolor);
    }

    stnText.SetRgch(prgch, cch);

    // Draw text
    surRendered = TTF_RenderText_Solid(ttfFont, stnText.Psz(), sdlcFore);
    Assert(surRendered != pvNil, "TTF_RenderText failed");

    if (surRendered != pvNil)
    {
        int ret = SDL_BlitSurface(surRendered, pvNil, _surface, &sdlRect);
        Assert(ret == 0, "BlitSurface failed");
        InvalidateTexture();

        SDL_FreeSurface(surRendered);
        surRendered = pvNil;
    }

    // Restore clipping region
    SDL_SetClipRect(_surface, pvNil);
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

    TTF_Font *ttfFont = pvNil;
    STN stnText;
    int dxpText, dypText;
    int dxp, dyp;
    int tmHeight = 0;
    int tmAscent = 0;

    // Validate parameters
    if (pdsf == pvNil)
    {
        goto LError;
    }

    // Find the font
    AssertDo(ttfFont = vntl.TtfFontFromOnn(pdsf->onn), "Font number not in font list");
    if (ttfFont == pvNil)
    {
        goto LError;
    }
    _SetTextProps(ttfFont, pdsf);

    // Get bounding box of text with current font
    stnText.SetRgch(prgch, cch);
    TTF_SizeText(ttfFont, stnText.Psz(), &dxpText, &dypText);

    tmAscent = TTF_FontAscent(ttfFont);
    tmHeight = TTF_FontHeight(ttfFont);

    switch (pdsf->tav)
    {
    default:
        BugVar("bogus vertical alignment", &pdsf->tav);
        [[fallthrough]];
    case tavTop:
        dyp = 0;
        break;

    case tavCenter:
        dyp = -(tmHeight / 2);
        break;

    case tavBaseline:
        dyp = -tmAscent;
        break;

    case tavBottom:
        dyp = -tmHeight;
        break;
    }

    switch (pdsf->tah)
    {
    default:
        BugVar("bogus horizontal alignment", &pdsf->tah);
        [[fallthrough]];
    case tahLeft:
        dxp = 0;
        break;

    case tahCenter:
        dxp = -dxpText / 2;
        break;

    case tahRight:
        dxp = -dxpText;
        break;
    }
    prcs->left = pts.x + dxp;
    prcs->right = pts.x + dxpText + dxp;
    prcs->top = pts.y + dyp;
    prcs->bottom = pts.y + tmHeight + dyp;

    return;

LError:
    *prcs = {0};
    PushErc(ercGfxCantSetFont);
    return;
}

/***************************************************************************
    Lock the pixels for the port if this is an offscreen PixMap.
    Must be balanced by a call to Unlock.
***************************************************************************/
void GPT::Lock(void)
{
    int ret;
    Assert(_cactLock >= 0, "invalid lock count");
    _cactLock++;
    if (_cactLock == 1)
    {
        ret = SDL_LockSurface(_surface);
        Assert(ret == 0, "SDL_LockSurface failed");
    }
}

/***************************************************************************
    Unlock the pixels for the port if this is an offscreen PixMap.
***************************************************************************/
void GPT::Unlock(void)
{
    Assert(_cactLock > 0, "calling unlock when not locked!");

    _cactLock--;
    if (_cactLock == 0)
    {
        SDL_UnlockSurface(_surface);
        InvalidateTexture();
    }
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

    bool fSetClip = fFalse;
    SDL_Rect srectSrc;
    SDL_Rect srectDst;

    // TODO: HACK: BWLD calls CopyPixels with a pgptSrc that is locked
    // force unlock it for now
    bool fRelock = fFalse;
    if (pgptSrc->_cactLock != 0)
    {
        OutputDebugStringA("warning: unlocking surface\n");
        pgptSrc->Unlock();
        fRelock = fTrue;
    }

    // TODO: refactor: reduce duplication of clipping rect setup
    if (pgdd->prcsClip != pvNil)
    {
        SDL_Rect sdlRectClip;
        sdlRectClip.x = pgdd->prcsClip->left;
        sdlRectClip.w = pgdd->prcsClip->right - pgdd->prcsClip->left;
        sdlRectClip.y = pgdd->prcsClip->top;
        sdlRectClip.h = pgdd->prcsClip->bottom - pgdd->prcsClip->top;
        SDL_SetClipRect(_surface, &sdlRectClip);
        fSetClip = fTrue;
    }

    if (_pregnClip == pvNil || _pregnClip->FIsRc())
    {
        // Clipping region is a rectangle
        srectSrc.x = prcsSrc->left;
        srectSrc.w = prcsSrc->right - prcsSrc->left;
        srectSrc.y = prcsSrc->top;
        srectSrc.h = prcsSrc->bottom - prcsSrc->top;
        srectDst.x = prcsDst->left;
        srectDst.w = prcsDst->right - prcsDst->left;
        srectDst.y = prcsDst->top;
        srectDst.h = prcsDst->bottom - prcsDst->top;
        SDL_BlitSurface(pgptSrc->_surface, &srectSrc, _surface, &srectDst);
    }
    else
    {
        // Clipping region is a set of rectangles
        // We need to break the rectangles up and draw each one

        // TODO: REVIEW

        // Source rectangle
        RC rcClipDest(0, 0, _surface->w, _surface->h);

        // Create a region scanner
        REGSC regsc;
        int32_t yp, dyp;
        int cr = 0;
        regsc.Init(_pregnClip, &rcClipDest);
        if (!rcClipDest.FEmpty())
        {
            yp = rcClipDest.ypTop;
            for (;;)
            {
                dyp = regsc.DypCur();
                while (regsc.XpCur() < klwMax)
                {
                    // Get destination rectangle
                    RC rc;
                    rc.xpLeft = regsc.XpCur() + rcClipDest.xpLeft;
                    rc.xpRight = regsc.XpFetch() + rcClipDest.xpLeft;
                    regsc.XpFetch();
                    rc.ypTop = yp;
                    rc.ypBottom = yp + dyp;

                    // Check the destination rectangle is within the caller's src rectangle
                    RC rcAllSrc = *prcsSrc;
                    if (!rc.FIntersect(&rcAllSrc))
                    {
                        break;
                    };

                    // Check the destination rectangle is within the caller's destination rectangle
                    RC rcAllDest = *prcsDst;
                    if (!rc.FIntersect(&rcAllDest))
                    {
                        break;
                    };

                    // Check the destination rectangle is within the clipping region if provided
                    if (pgdd->prcsClip != pvNil)
                    {
                        RC rcClip = *(pgdd->prcsClip);
                        if (!rc.FIntersect(&rc))
                        {
                            break;
                        }
                    }

                    if (!rc.FEmpty())
                    {
                        // Convert rectangles to SDL rectangles
                        srectDst.x = rc.xpLeft;
                        srectDst.y = rc.ypTop;
                        srectDst.w = rc.Dxp();
                        srectDst.h = rc.Dyp();

                        srectSrc = srectDst;
                        srectSrc.x = srectSrc.x - rcAllDest.xpLeft + rcAllSrc.xpLeft;
                        srectSrc.y = srectSrc.y - rcAllDest.ypTop + rcAllSrc.ypTop;

                        // Blit
                        if (SDL_BlitSurface(pgptSrc->_surface, &srectSrc, _surface, &srectDst) != 0)
                        {
                            // TODO: error handling
                            Bug(SDL_GetError());
                        }
                    }
                }

                if ((yp += dyp) >= rcClipDest.ypBottom)
                    break;
                regsc.ScanNext(dyp);
            }
        }
    }

    InvalidateTexture();

    if (fSetClip)
    {
        SDL_SetClipRect(_surface, pvNil);
    }

    // TODO: fix BWLD to not need this hack
    if (fRelock)
    {
        pgptSrc->Lock();
    }
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
    RC rcSrc, rcDst, rcClip;

    rcDst = *prcs;
    if (pvNil != pgdd->prcsClip)
    {
        rcClip = *pgdd->prcsClip;
        if (!rcClip.FIntersect(&rcDst))
            return;
    }
    else
        rcClip = rcDst;
    pmbmp->GetRc(&rcSrc);
    if (rcSrc.FEmpty())
        return;

    if (_surface->format->BitsPerPixel == 8 && rcSrc.Dxp() == rcDst.Dxp() && rcSrc.Dyp() == rcDst.Dyp())
    {
        // TODO: _rcOff
        // Assert(_rcOff.xpLeft == 0 && _rcOff.ypTop == 0, "bad _rcOff");
        // if (!rcClip.FIntersect(&_rcOff))
        // return;

        Lock();
        pmbmp->Draw((byte *)_surface->pixels, _surface->w * _surface->format->BytesPerPixel, _surface->h,
                    rcDst.xpLeft - rcSrc.xpLeft, rcDst.ypTop - rcSrc.ypTop, &rcClip, _pregnClip);
        Unlock();
    }
    else
    {
        // not implemented
        RawRtn();
    }
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
    PGL pglclr;
    CLR rgclr[256];
    int cclr;

    ClearPb(rgclr, SIZEOF(rgclr));

    Assert(_pal != pvNil, "no palette");

    cclr = _pal->ncolors;
    Assert(cclr <= 256, "too many colors in palette");

    // Convert SDL colors to CLRs
    for (int isdlc = 0; isdlc < cclr; isdlc++)
    {
        SDL_Color sdlc = _pal->colors[isdlc];
        CLR clr;
        clr.bRed = sdlc.r;
        clr.bGreen = sdlc.g;
        clr.bBlue = sdlc.b;
        clr.bZero = 0;
        rgclr[isdlc] = clr;
    }

    if (pvNil == (pglclr = GL::PglNew(SIZEOF(CLR), cclr)))
        return pvNil;

    AssertDo(pglclr->FSetIvMac(cclr), 0);
    CopyPb(rgclr, pglclr->QvGet(0), LwMul(SIZEOF(CLR), cclr));

    return pglclr;
}

void GPT::Flip()
{
    UpdateTexture();

    Assert(!_fOffscreen, "drawing an offscreen GPT to the screen?");

    // Paint the texture
    SDL_RenderClear(_renderer);
    SDL_RenderCopy(_renderer, _texture, NULL, NULL);
    SDL_RenderPresent(_renderer);
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
