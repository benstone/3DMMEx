/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    GFX classes: graphics port (GPT), graphics environment (GNV)

***************************************************************************/
#ifndef GFX_H
#define GFX_H

/****************************************
    Text and fonts.
****************************************/
// DeScription of a Font.
struct DSF
{
    int32_t onn;     // Font number.
    uint32_t grfont; // Font style.
    int32_t dyp;     // Font height in points.
    int32_t tah;     // Horizontal Text Alignment
    int32_t tav;     // Vertical Text Alignment

    ASSERT
};

// fONT Styles - note that these match the Mac values
enum
{
    fontNil = 0,
    fontBold = 1,
    fontItalic = 2,
    fontUnderline = 4,
    fontBoxed = 8,
};

// Horizontal Text Alignment.
enum
{
    tahLeft,
    tahCenter,
    tahRight,
    tahLim
};

// Vertical Text Alignment
enum
{
    tavTop,
    tavCenter,
    tavBaseline,
    tavBottom,
    tavLim
};

/****************************************
    Font List
****************************************/
const int32_t onnNil = -1;

#ifdef KAUAI_WIN32
int CALLBACK _FEnumFont(const LOGFONT *plgf, const TEXTMETRIC *ptxm, UINT luType, LPARAM luParam);
#endif // KAUAI_WIN32

#define NTL_PAR BASE
#define kclsNTL KLCONST3('N', 'T', 'L')
class NTL : public NTL_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    NOCOPY(NTL)

  private:
#ifdef KAUAI_WIN32
    friend int CALLBACK _FEnumFont(const LOGFONT *plgf, const TEXTMETRIC *ptxm, UINT luType, LPARAM luParam);
#endif // KAUAI_WIN32
    PGST _pgst;
    int32_t _onnSystem;

  public:
    NTL(void);
    ~NTL(void);

#ifdef KAUAI_WIN32
    HFONT HfntCreate(DSF *pdsf);
#endif // KAUAI_WIN32
#ifdef MAC
    int16_t FtcFromOnn(int32_t onn);
#endif // MAC

    bool FInit(void);
    int32_t OnnSystem(void)
    {
        return _onnSystem;
    }
    void GetStn(int32_t onn, PSTN pstn);
    bool FGetOnn(PSTN pstn, int32_t *ponn);
    int32_t OnnMapStn(PSTN pstn, int16_t osk = koskCur);
    int32_t OnnMac(void);
    bool FFixedPitch(int32_t onn);

#ifdef DEBUG
    bool FValidOnn(int32_t onn);
#endif // DEBUG
};
extern NTL vntl;

/****************************************
    Color and pattern
****************************************/
#ifdef WIN
typedef COLORREF SCR;
#elif defined(MAC)
typedef RGBColor SCR;
#endif //! MAC

// NOTE: this matches the Windows RGBQUAD structure
struct CLR
{
    uint8_t bBlue;
    uint8_t bGreen;
    uint8_t bRed;
    uint8_t bZero;
};

#ifdef DEBUG
enum
{
    facrNil,
    facrRgb = 1,
    facrIndex = 2,
};
#endif // DEBUG

enum
{
    kbNilAcr = 0,
    kbRgbAcr = 1,
    kbIndexAcr = 0xFE,
    kbSpecialAcr = 0xFF
};

const uint32_t kluAcrInvert = 0xFF000000L;
const uint32_t kluAcrClear = 0xFFFFFFFFL;

// Abstract ColoR
class ACR
{
    friend class GPT;
    ASSERT

  private:
    uint32_t _lu;

#ifdef WIN
    SCR _Scr(void);
#endif // WIN
#ifdef MAC
    void _SetFore(void);
    void _SetBack(void);
#endif // MAC

#ifdef KAUAI_SDL
    SDL_Color _SDLColor(void);
#endif // KAUAI_SDL

  public:
    ACR(void)
    {
        _lu = 0;
    }
    ACR(CLR clr)
    {
        _lu = LwFromBytes(kbRgbAcr, clr.bRed, clr.bGreen, clr.bBlue);
    }
    void Set(CLR clr)
    {
        _lu = LwFromBytes(kbRgbAcr, clr.bRed, clr.bGreen, clr.bBlue);
    }
    ACR(uint8_t bRed, uint8_t bGreen, uint8_t bBlue)
    {
        _lu = LwFromBytes(kbRgbAcr, bRed, bGreen, bBlue);
    }
    void Set(uint8_t bRed, uint8_t bGreen, uint8_t bBlue)
    {
        _lu = LwFromBytes(kbRgbAcr, bRed, bGreen, bBlue);
    }
    ACR(uint8_t iscr)
    {
        _lu = LwFromBytes(kbIndexAcr, 0, 0, iscr);
    }
    void SetToIndex(uint8_t iscr)
    {
        _lu = LwFromBytes(kbIndexAcr, 0, 0, iscr);
    }
    ACR(bool fClear, bool fIgnored)
    {
        _lu = fClear ? kluAcrClear : kluAcrInvert;
    }
    void SetToClear(void)
    {
        _lu = kluAcrClear;
    }
    void SetToInvert(void)
    {
        _lu = kluAcrInvert;
    }

    void SetFromLw(int32_t lw);
    int32_t LwGet(void) const;
    void GetClr(CLR *pclr);

    bool operator==(const ACR &acr) const
    {
        return _lu == acr._lu;
    }
    bool operator!=(const ACR &acr) const
    {
        return _lu != acr._lu;
    }
};

#ifdef SYMC
extern ACR kacrBlack;
extern ACR kacrDkGray;
extern ACR kacrGray;
extern ACR kacrLtGray;
extern ACR kacrWhite;
extern ACR kacrRed;
extern ACR kacrGreen;
extern ACR kacrBlue;
extern ACR kacrYellow;
extern ACR kacrCyan;
extern ACR kacrMagenta;
extern ACR kacrClear;
extern ACR kacrInvert;
#else  //! SYMC
const ACR kacrBlack(0, 0, 0);
const ACR kacrDkGray(0x3F, 0x3F, 0x3F);
const ACR kacrGray(0x7F, 0x7F, 0x7F);
const ACR kacrLtGray(0xBF, 0xBF, 0xBF);
const ACR kacrWhite(kbMax, kbMax, kbMax);
const ACR kacrRed(kbMax, 0, 0);
const ACR kacrGreen(0, kbMax, 0);
const ACR kacrBlue(0, 0, kbMax);
const ACR kacrYellow(kbMax, kbMax, 0);
const ACR kacrCyan(0, kbMax, kbMax);
const ACR kacrMagenta(kbMax, 0, kbMax);
const ACR kacrClear(fTrue, fTrue);
const ACR kacrInvert(fFalse, fFalse);
#endif //! SYMC

// abstract pattern
struct APT
{
    uint8_t rgb[8];

    bool operator==(APT &apt)
    {
        return ((int32_t *)rgb)[0] == ((int32_t *)apt.rgb)[0] && ((int32_t *)rgb)[1] == ((int32_t *)apt.rgb)[1];
    }
    bool operator!=(APT &apt)
    {
        return ((int32_t *)rgb)[0] != ((int32_t *)apt.rgb)[0] || ((int32_t *)rgb)[1] != ((int32_t *)apt.rgb)[1];
    }

    void SetSolidFore(void)
    {
        ((int32_t *)rgb)[0] = -1L;
        ((int32_t *)rgb)[1] = -1L;
    }
    bool FSolidFore(void)
    {
        return (((int32_t *)rgb)[0] & ((int32_t *)rgb)[1]) == -1L;
    }
    void SetSolidBack(void)
    {
        ((int32_t *)rgb)[0] = 0L;
        ((int32_t *)rgb)[1] = 0L;
    }
    bool FSolidBack(void)
    {
        return (((int32_t *)rgb)[0] | ((int32_t *)rgb)[1]) == 0L;
    }
    void Invert(void)
    {
        ((int32_t *)rgb)[0] = ~((int32_t *)rgb)[0];
        ((int32_t *)rgb)[1] = ~((int32_t *)rgb)[1];
    }
    void MoveOrigin(int32_t dxp, int32_t dyp);
};
extern APT vaptGray;
extern APT vaptLtGray;
extern APT vaptDkGray;

/****************************************
    Polygon structure - designed to be
    compatible with the Mac's
    Polygon.
****************************************/
struct OLY // pOLYgon
{
#ifdef MAC
    int16_t cb; // size of the whole thing
    RCS rcs;    // bounding rectangle
    PTS rgpts[1];

    int32_t Cpts(void)
    {
        return (cb - offset(OLY, rgpts[0])) / size(PTS);
    }
#else  //! MAC
    int32_t cpts;
    PTS rgpts[1];

    int32_t Cpts(void)
    {
        return cpts;
    }
#endif //! MAC

    ASSERT
};
const int32_t kcbOlyBase = SIZEOF(OLY) - SIZEOF(PTS);

/****************************************
    High level polygon - a GL of PT's.
****************************************/
enum
{
    fognNil = 0,
    fognAutoClose = 1,
    fognLim
};

typedef class OGN *POGN;
#define OGN_PAR GL
#define kclsOGN KLCONST3('O', 'G', 'N')
class OGN : public OGN_PAR
{
    RTCLASS_DEC

  private:
    struct AEI // Add Edge Info.
    {
        PT *prgpt;
        int32_t cpt;
        int32_t iptPenCur;
        PT ptCur;
        POGN pogn;
        int32_t ipt;
        int32_t dipt;
    };
    bool _FAddEdge(AEI *paei);

  protected:
    OGN(void);

  public:
    PT *PrgptLock(int32_t ipt = 0)
    {
        return (PT *)PvLock(ipt);
    }
    PT *QrgptGet(int32_t ipt = 0)
    {
        return (PT *)QvGet(ipt);
    }

    POGN PognTraceOgn(POGN pogn, uint32_t grfogn);
    POGN PognTraceRgpt(PT *prgpt, int32_t cpt, uint32_t grfogn);

    // static methods
    static POGN PognNew(int32_t cvInit = 0);
};

int32_t IptFindLeftmost(PT *prgpt, int32_t cpt, int32_t dxp, int32_t dyp);

/****************************************
    Graphics drawing data - a parameter
    to drawing apis in the GPT class
****************************************/
enum
{
    fgddNil = 0,
    fgddFill = fgddNil,
    fgddFrame = 1,
    fgddPattern = 2,
    fgddAutoClose = 4,
};

// graphics drawing data
struct GDD
{
    uint32_t grfgdd; // what to do
    APT apt;         // pattern to use
    ACR acrFore;     // foreground color (used for solid fills also)
    ACR acrBack;     // background color
    int32_t dxpPen;  // pen width (used if framing)
    int32_t dypPen;  // pen height
    RCS *prcsClip;   // clipping (may be pvNil)
};

/****************************************
    Graphics environment
****************************************/
#define GNV_PAR BASE
#define kclsGNV KLCONST3('G', 'N', 'V')
class GNV : public GNV_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  private:
    PGPT _pgpt; // the port

    // coordinate mapping
    RC _rcSrc;
    RC _rcDst;

    // current pen location and clipping
    int32_t _xp;
    int32_t _yp;
    RCS _rcsClip;
    RC _rcVis; // always clipped to - this is in Dst coordinates

    // Current font
    DSF _dsf;

    // contains the current pen size and prcsClip
    // this is passed to the GPT
    GDD _gdd;

    void _Init(PGPT pgpt);
    bool _FMapRcRcs(RC *prc, RCS *prcs);
    void _MapPtPts(int32_t xp, int32_t yp, PTS *ppts);
    HQ _HqolyCreate(POGN pogn, uint32_t grfogn);
    HQ _HqolyFrame(POGN pogn, uint32_t grfogn);

    // transition related methods
    bool _FInitPaletteTrans(PGL pglclr, PGL *ppglclrOld, PGL *ppglclrTrans, int32_t cbitPixel = 0);
    void _PaletteTrans(PGL pglclrOld, PGL pglclrNew, int32_t lwNum, int32_t lwDen, PGL pglclrTrans,
                       CLR *pclrSub = pvNil);
    bool _FEnsureTempGnv(PGNV *ppgnv, RC *prc);

  public:
    GNV(PGPT pgpt);
    GNV(PGOB pgob);
    GNV(PGOB pgob, PGPT pgpt);
    ~GNV(void);

    void SetGobRc(PGOB pgob);
    PGPT Pgpt(void)
    {
        return _pgpt;
    }
#ifdef MAC
    void Set(void);
    void Restore(void);
#endif // MAC
#ifdef KAUAI_WIN32
    // this gross API is for AVI playback
    void DrawDib(HDRAWDIB hdd, BITMAPINFOHEADER *pbi, RC *prc);
#endif // KAUAI_WIN32

    void SetPenSize(int32_t dxp, int32_t dyp);

    void FillRcApt(RC *prc, APT *papt, ACR acrFore, ACR acrBack);
    void FillRc(RC *prc, ACR acr);
    void FrameRcApt(RC *prc, APT *papt, ACR acrFore, ACR acrBack);
    void FrameRc(RC *prc, ACR acr);
    void HiliteRc(RC *prc, ACR acrBack);

    void FillOvalApt(RC *prc, APT *papt, ACR acrFore, ACR acrBack);
    void FillOval(RC *prc, ACR acr);
    void FrameOvalApt(RC *prc, APT *papt, ACR acrFore, ACR acrBack);
    void FrameOval(RC *prc, ACR acr);

    void FillOgnApt(POGN pogn, APT *papt, ACR acrFore, ACR acrBack);
    void FillOgn(POGN pogn, ACR acr);
    void FrameOgnApt(POGN pogn, APT *papt, ACR acrFore, ACR acrBack);
    void FrameOgn(POGN pogn, ACR acr);
    void FramePolyLineApt(POGN pogn, APT *papt, ACR acrFore, ACR acrBack);
    void FramePolyLine(POGN pogn, ACR acr);

    void MoveTo(int32_t xp, int32_t yp)
    {
        _xp = xp;
        _yp = yp;
    }
    void MoveRel(int32_t dxp, int32_t dyp)
    {
        _xp += dxp;
        _yp += dyp;
    }
    void LineToApt(int32_t xp, int32_t yp, APT *papt, ACR acrFore, ACR acrBack)
    {
        LineApt(_xp, _yp, xp, yp, papt, acrFore, acrBack);
    }
    void LineTo(int32_t xp, int32_t yp, ACR acr)
    {
        Line(_xp, _yp, xp, yp, acr);
    }
    void LineRelApt(int32_t dxp, int32_t dyp, APT *papt, ACR acrFore, ACR acrBack)
    {
        LineApt(_xp, _yp, _xp + dxp, _yp + dyp, papt, acrFore, acrBack);
    }
    void LineRel(int32_t dxp, int32_t dyp, ACR acr)
    {
        Line(_xp, _yp, _xp + dxp, _yp + dyp, acr);
    }
    void LineApt(int32_t xp1, int32_t yp1, int32_t xp2, int32_t yp2, APT *papt, ACR acrFore, ACR acrBack);
    void Line(int32_t xp1, int32_t yp1, int32_t xp2, int32_t yp2, ACR acr);

    void ScrollRc(RC *prc, int32_t dxp, int32_t dyp, RC *prc1 = pvNil, RC *prc2 = pvNil);
    static void GetBadRcForScroll(RC *prc, int32_t dxp, int32_t dyp, RC *prc1, RC *prc2);

    // for mapping
    void GetRcSrc(RC *prc);
    void SetRcSrc(RC *prc);
    void GetRcDst(RC *prc);
    void SetRcDst(RC *prc);
    void SetRcVis(RC *prc);
    void IntersectRcVis(RC *prc);

    // set clipping
    void ClipRc(RC *prc);
    void ClipToSrc(void);

    // Text & font.
    void SetFont(int32_t onn, uint32_t grfont, int32_t dypFont, int32_t tah = tahLeft, int32_t tav = tavTop);
    void SetOnn(int32_t onn);
    void SetFontStyle(uint32_t grfont);
    void SetFontSize(int32_t dyp);
    void SetFontAlign(int32_t tah, int32_t tav);
    void GetDsf(DSF *pdsf);
    void SetDsf(DSF *pdsf);
    void DrawRgch(const achar *prgch, int32_t cch, int32_t xp, int32_t yp, ACR acrFore = kacrBlack,
                  ACR acrBack = kacrClear);
    void DrawStn(PSTN pstn, int32_t xp, int32_t yp, ACR acrFore = kacrBlack, ACR acrBack = kacrClear);
    void GetRcFromRgch(RC *prc, const achar *prgch, int32_t cch, int32_t xp = 0, int32_t yp = 0);
    void GetRcFromStn(RC *prc, PSTN pstn, int32_t xp = 0, int32_t yp = 0);

    // bitmaps and pictures
    void CopyPixels(PGNV pgnvSrc, RC *prcSrc, RC *prcDst);
    void DrawPic(PPIC ppic, RC *prc);
    void DrawMbmp(PMBMP pmbmp, int32_t xp, int32_t yp);
    void DrawMbmp(PMBMP pmbmp, RC *prc);

    // transitions
    void Wipe(int32_t gfd, ACR acrFill, PGNV pgnvSrc, RC *prcSrc, RC *prcDst, uint32_t dts, PGL pglclr = pvNil);
    void Slide(int32_t gfd, ACR acrFill, PGNV pgnvSrc, RC *prcSrc, RC *prcDst, uint32_t dts, PGL pglclr = pvNil);
    void Dissolve(int32_t crcWidth, int32_t crcHeight, ACR acrFill, PGNV pgnvSrc, RC *prcSrc, RC *prcDst, uint32_t dts,
                  PGL pglclr = pvNil);
    void Fade(int32_t cactMax, ACR acrFade, PGNV pgnvSrc, RC *prcSrc, RC *prcDst, uint32_t dts, PGL pglclr = pvNil);
    void Iris(int32_t gfd, int32_t xp, int32_t yp, ACR acrFill, PGNV pgnvSrc, RC *prcSrc, RC *prcDst, uint32_t dts,
              PGL pglclr = pvNil);
};

// palette setting options
enum
{
    fpalNil = 0,
    fpalIdentity = 1, // make this an identity palette
    fpalInitAnim = 2, // make the palette animatable
    fpalAnimate = 4,  // animate the current palette with these colors
};

/****************************************
    Graphics port
****************************************/
#define GPT_PAR BASE
#define kclsGPT KLCONST3('G', 'P', 'T')
class GPT : public GPT_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  private:
    PREGN _pregnClip;
    RC _rcClip;
    PT _ptBase; // coordinates assigned to top-left of the GPT

#ifdef KAUAI_WIN32
#ifdef DEBUG
    static bool _fFlushGdi;
#endif
    static HPAL _hpal;
    static HPAL _hpalIdentity;
    static CLR *_prgclr;
    static int32_t _cclrPal;
    static int32_t _cactPalCur;
    static int32_t _cactFlush;
    static bool _fPalettized; // whether the screen is palettized

    HDC _hdc;
    KWND _hwnd;
    HBMP _hbmp;           // nil if not an offscreen port
    uint8_t *_prgbPixels; // nil if not a dib section port
    int32_t _cbitPixel;
    int32_t _cbRow;
    RC _rcOff;         // bounding rectangle for a metafile or dib port
    int32_t _cactPal;  // which palette this port has selected
    int32_t _cactDraw; // last draw - for knowing when to call GdiFlush

    // selected brush and its related info
    enum // brush kind
    {
        bkNil,
        bkApt,
        bkAcr,
        bkStock
    };
    HBRUSH _hbr;
    int32_t _bk;
    APT _apt;   // for bkApt
    ACR _acr;   // for bkAcr
    int _wType; // for bkStock (stock brush)

    HFONT _hfnt;
    DSF _dsf;

    bool _fNewClip : 1; // _pregnClip has changed
    bool _fMetaFile : 1;
    bool _fMapIndices : 1; // SelectPalette failed, map indices to RGBs
    bool _fOwnPalette : 1; // this offscreen has its own palette

    void _SetClip(RCS *prcsClip);
    void _EnsurePalette(void);
    void _SetTextProps(DSF *pdsf);
    void _SetAptBrush(APT *papt);
    void _SetAcrBrush(ACR acr);
    void _SetStockBrush(int wType);

    void _FillRcs(RCS *prcs);
    void _FillOval(RCS *prcs);
    void _FillPoly(OLY *poly);
    void _FillRgn(HRGN *phrgn);
    void _FrameRcsOval(RCS *prcs, GDD *pgdd, bool fOval);
    SCR _Scr(ACR acr);

    bool _FInit(HDC hdc);
#endif // KAUAI_WIN32

#ifdef MAC
    static HCLT _hcltDef;
    static bool _fForcePalOnSys;
    static HCLT _HcltUse(int32_t cbitPixel);

    // WARNING: the PPRT's below may be GWorldPtr's instead of GrafPtr's
    // Only use SetGWorld or GetGWorld on these.  Don't assume they
    // point to GrafPort's.
    PPRT _pprt; // may be a GWorldPtr
    HGD _hgd;
    PPRT _pprtSav; // may be a GWorldPtr
    HGD _hgdSav;
    int16_t _cactLock;  // lock count for pixels (if offscreen)
    int16_t _cbitPixel; // depth of bitmap (if offscreen)
    bool _fSet : 1;
    bool _fOffscreen : 1;
    bool _fNoClip : 1;
    bool _fNewClip : 1; //_pregnClip is new

    // for picture based GPT's
    RC _rcOff; // also valid for offscreen GPTs
    HPIC _hpic;

    HPIX _Hpix(void);
    void _FillRcs(RCS *prcs);
    void _FrameRcs(RCS *prcs);
    void _FillOval(RCS *prcs);
    void _FrameOval(RCS *prcs);
    void _FillPoly(HQ *phqoly);
    void _FramePoly(HQ *phqoly);
    void _DrawLine(PTS *prgpts);
    void _GetRcsFromRgch(RCS *prcs, achar *prgch, int16_t cch, PTS *ppts, DSF *pdsf);
#endif // MAC

#ifdef KAUAI_SDL

    bool _fNewClip : 1;   //_pregnClip is new
    bool _fOffscreen : 1; // is offscreen

    // Window to render to
    SDL_Window *_wnd = pvNil;
    // Renderer to use when rendering
    SDL_Renderer *_renderer = pvNil;
    // Surface to render to
    SDL_Surface *_surface = pvNil;
    // Texture used for rendering the image
    SDL_Texture *_texture = pvNil;

    // Set to True if the surface has changed / the texture needs to be updated
    bool _fSurfaceDirty = fTrue;

    // Configure an SDL font with the options in a given DSF
    void _SetTextProps(TTF_Font *ttfFont, DSF *pdsf);

#endif // KAUAI_SDL

    int32_t _cactLock = 0; // lock count

    // low level draw routine
    typedef void (GPT::*PFNDRW)(void *);
    void _Fill(void *pv, GDD *pgdd, PFNDRW pfn);

    GPT(void)
    {
    }
    ~GPT(void);

  public:
#ifdef KAUAI_WIN32
    static PGPT PgptNew(HDC hdc);
    static PGPT PgptNewHwnd(KWND hwnd);

    static int32_t CclrSetPalette(KWND hwnd, bool fInval);

    // this gross API is for AVI playback
    void DrawDib(HDRAWDIB hdd, BITMAPINFOHEADER *pbi, RCS *prcs, GDD *pgdd);
#endif // KAUAI_WIN32
#ifdef KAUAI_SDL

    static PGPT PgptNew(HDC hdc);
    static PGPT PgptNewHwnd(KWND hwnd);

    static PGPT PgptNew(SDL_Window *wnd, int32_t cbitPixel, bool fOffscreen, int32_t dxp, int32_t dyp);

    // Repaint window
    void Flip();

    // Called when the surface is changed
    void InvalidateTexture(void);
    // Copy contents of surface to texture
    void UpdateTexture(void);
    // Save contents of this GPT to a bitmap for debugging
    void DumpBitmap(STN *stnBmp);

#endif // KAUAI_SDL
#ifdef MAC
    static PGPT PgptNew(PPRT pprt, HGD hgd = hNil);

    static bool FCanScreen(int32_t cbitPixel, bool fColor);
    static bool FSetScreenState(int32_t cbitPixel, bool tColor);
    static void GetScreenState(int32_t *pcbitPixel, bool *pfColor);

    void Set(RCS *prcsClip);
    void Restore(void);
#endif // MAC
#ifdef DEBUG
    static void MarkStaticMem(void);
#endif // DEBUG

    static void SetActiveColors(PGL pglclr, uint32_t grfpal);
    static PGL PglclrGetPalette(void);
    static void Flush(void);

    static PGPT PgptNewOffscreen(RC *prc, int32_t cbitPixel);
    static PGPT PgptNewPic(RC *prc);
    PPIC PpicRelease(void);
    void SetOffscreenColors(PGL pglclr = pvNil);

    void ClipToRegn(PREGN *ppregn);
    void SetPtBase(PT *ppt);
    void GetPtBase(PT *ppt);

    void DrawRcs(RCS *prcs, GDD *pgdd);
    void HiliteRcs(RCS *prcs, GDD *pgdd);
    void DrawOval(RCS *prcs, GDD *pgdd);
    void DrawLine(PTS *ppts1, PTS *ppts2, GDD *pgdd);
    void DrawPoly(HQ hqoly, GDD *pgdd);
    void ScrollRcs(RCS *prcs, int32_t dxp, int32_t dyp, GDD *pgdd);

    void DrawRgch(const achar *prgch, int32_t cch, PTS pts, GDD *pgdd, DSF *pdsf);
    void GetRcsFromRgch(RCS *prcs, const achar *prgch, int32_t cch, PTS pts, DSF *pdsf);

    void CopyPixels(PGPT pgptSrc, RCS *prcsSrc, RCS *prcsDst, GDD *pgdd);
    void DrawPic(PPIC ppic, RCS *prcs, GDD *pgdd);
    void DrawMbmp(PMBMP pmbmp, RCS *prcs, GDD *pgdd);

    void Lock(void);
    void Unlock(void);
    uint8_t *PrgbLockPixels(RC *prc = pvNil);
    int32_t CbRow(void);
    int32_t CbitPixel(void);
};

/****************************************
    Regions
****************************************/
bool FCreateRgn(HRGN *phrgn, RC *prc);
void FreePhrgn(HRGN *phrgn);
bool FSetRectRgn(HRGN *phrgn, RC *prc);
bool FUnionRgn(HRGN hrgnDst, HRGN hrgnSrc1, HRGN hrgnSrc2);
bool FIntersectRgn(HRGN hrgnDst, HRGN hrgnSrc1, HRGN hrgnSrc2, bool *pfEmpty = pvNil);
bool FDiffRgn(HRGN hrgnDst, HRGN hrgnSrc, HRGN hrgnSrcSub, bool *pfEmpty = pvNil);
bool FRectRgn(HRGN hrgn, RC *prc = pvNil);
bool FEmptyRgn(HRGN hrgn, RC *prc = pvNil);
bool FEqualRgn(HRGN hrgn1, HRGN hrgn2);

/****************************************
    Misc.
****************************************/
bool FInitGfx(void);

// stretch by a factor of 2 in each dimension.
void DoubleStretch(uint8_t *prgbSrc, int32_t cbRowSrc, int32_t dypSrc, RC *prcSrc, uint8_t *prgbDst, int32_t cbRowDst,
                   int32_t dypDst, int32_t xpDst, int32_t ypDst, RC *prcClip, PREGN pregnClip);

// stretch by a factor of 2 in vertical direction only.
void DoubleVertStretch(uint8_t *prgbSrc, int32_t cbRowSrc, int32_t dypSrc, RC *prcSrc, uint8_t *prgbDst,
                       int32_t cbRowDst, int32_t dypDst, int32_t xpDst, int32_t ypDst, RC *prcClip, PREGN pregnClip);

// Number of times that the palette has changed (via a call to CclrSetPalette
// or SetActiveColors). This can be used by other modules to detect a palette
// change.
extern int32_t vcactRealize;

#endif //! GFX_H
