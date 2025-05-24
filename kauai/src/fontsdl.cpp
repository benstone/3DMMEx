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

#ifdef WIN
#include <shlobj.h>
#endif // WIN

RTCLASS(SDLFont)
RTCLASS(SDLFontFile)
RTCLASS(SDLFontMemory)

/***************************************************************************
    Get the path to the system font directory
***************************************************************************/
static bool FFindSystemFontDir(PFNI pfniSystemFontDir)
{
    AssertPo(pfniSystemFontDir, 0);

    pfniSystemFontDir->SetNil();

#if defined(WIN)

    STN stnSystemFontDir;
    achar szSystemFontDir[MAX_PATH];
    HRESULT hr;

    hr = SHGetFolderPath(NULL, CSIDL_FONTS, NULL, 0, szSystemFontDir);
    if (FAILED(hr))
        return fFalse;

    Assert(CchSz(szSystemFontDir) < kcchMaxSz, "System font path does not fit in a STN");
    if (CchSz(szSystemFontDir) >= kcchMaxSz)
        return fFalse;
    stnSystemFontDir.SetSz(szSystemFontDir);

    return pfniSystemFontDir->FBuildFromPath(&stnSystemFontDir, kftgDir);
#else  // !WIN
    // TODO: Find a directory containing fonts
    RawRtn();
    return fFalse;
#endif // WIN
}

/***************************************************************************
    Find a font to use as the default system font
***************************************************************************/
static bool FFindDefaultFontFile(PFNI pfniFontDir, PFNI pfniDefaultFont)
{
    AssertPo(pfniFontDir, 0);
    AssertPo(pfniDefaultFont, 0);

    STN stn;
    FNE fne;
    FTG ftgTtf = KLCONST3('T', 'T', 'F');

    // Check for any of these default font files:
    PCSZ rgpszDefaultFontFiles[] = {
        PszLit("vgasys.fon"), // System (Windows)
        PszLit("comic.ttf"),  // Comic Sans MS
    };

    for (int32_t ipsz = 0; ipsz < CvFromRgv(rgpszDefaultFontFiles); ipsz++)
    {
        stn = rgpszDefaultFontFiles[ipsz];
        FNI fniFont = *pfniFontDir;
        if (!fniFont.FSetLeaf(&stn))
            continue;

        if (fniFont.TExists() == tYes)
        {
            *pfniDefaultFont = fniFont;
            return fTrue;
        }
    }

    // Return the first font file in the font directory
    if (!fne.FInit(pfniFontDir, &ftgTtf, 1, 0))
        return fFalse;

    return fne.FNextFni(pfniDefaultFont);
}

/***************************************************************************
    Load the font using SDL_TTF to get the font face name and style
***************************************************************************/
static bool FGetTtfFontInfo(PFNI pfniFont, PSTN pstnFontName, int32_t *pgrfont)
{
    AssertPo(pfniFont, 0);
    AssertPo(pstnFontName, 0);
    AssertVarMem(pgrfont);

    BOOL fRet = fFalse;
    int grfont = 0;
    STN stnFontName, stnFontPath;

    // Load the font to get font name and style info
    pfniFont->GetStnPath(&stnFontPath);

    U8SZ u8szFontPath;
    stnFontPath.GetUtf8Sz(u8szFontPath);

    TTF_Font *ttfFont = TTF_OpenFont(u8szFontPath, 0);
    if (ttfFont != pvNil)
    {
        // Get the font name
        PU8SZ pu8szFontName = (PU8SZ)TTF_FontFaceFamilyName(ttfFont);
        stnFontName.SetUtf8Sz(pu8szFontName);

        // Get the font style
        int style = TTF_GetFontStyle(ttfFont);
        if (FPure(style & TTF_STYLE_BOLD))
            grfont |= fontBold;
        if (FPure(style & TTF_STYLE_ITALIC))
            grfont |= fontItalic;
        if (FPure(style & TTF_STYLE_UNDERLINE))
            grfont |= fontUnderline;

        if (stnFontName.Cch() > 0)
            fRet = fTrue;

        TTF_CloseFont(ttfFont);
    }

    if (fRet)
    {
        *pstnFontName = stnFontName;
        *pgrfont = grfont;
    }
    else
    {
        pstnFontName->SetNil();
        TrashVar(pgrfont);
    }

    return fRet;
}

NTL::~NTL(void)
{
    if (_pgst != pvNil)
    {
        for (int32_t onn = 0; onn < _pgst->IvMac(); onn++)
        {
            PGL pgl;
            _pgst->GetExtra(onn, &pgl);
            if (pgl != pvNil)
            {
                PSDLFont psdlf = pvNil;
                while (pgl->FPop(&psdlf))
                {
                    ReleasePpo(&psdlf);
                }
            }

            ReleasePpo(&pgl);
        }
    }
    ReleasePpo(&_pgst);

    if (fInitTtf)
    {
        TTF_Quit();
    }
}

#ifdef DEBUG
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
    MarkMemObj(_pgst);

    for (int32_t onn = 0; onn < _pgst->IstnMac(); onn++)
    {
        PGL pglsdlfont = pvNil;
        _pgst->GetExtra(onn, &pglsdlfont);
        if (pglsdlfont != pvNil)
        {
            MarkMemObj(pglsdlfont);
            for (int32_t isdlf = 0; isdlf < pglsdlfont->IvMac(); isdlf++)
            {
                PSDLFont psdlf;
                pglsdlfont->Get(isdlf, &psdlf);
                MarkMemObj(psdlf);
            }
        }
    }
}

#endif // DEBUG

bool NTL::FAddAllFontsInDir(PFNI pfniFontDir)
{
    AssertPo(pfniFontDir, 0);

    FTG rgftgFont[] = {KLCONST3('T', 'T', 'F'), KLCONST3('T', 'T', 'C')};
    FNE fneFontFiles;
    FNI fniFontFile;
    int onn;
    PGL pglsdlfont = pvNil;

    // Find all font files in the font directory
    if (!fneFontFiles.FInit(pfniFontDir, rgftgFont, CvFromRgv(rgftgFont), ffneNil))
    {
        Bug("Could not initialise font directory enumerator");
        return fFalse;
    }

    while (fneFontFiles.FNextFni(&fniFontFile))
    {
        STN stnFontName;
        int grfont;
        bool fUseFont;

        fUseFont = FGetTtfFontInfo(&fniFontFile, &stnFontName, &grfont);
        if (!fUseFont)
            continue;

        // Get the list of SDL fonts for this font name
        if (_pgst->FFindStn(&stnFontName, &onn))
        {
            _pgst->GetExtra(onn, &pglsdlfont);
            AssertPo(pglsdlfont, 0);
            pglsdlfont->AddRef();
        }
        else
        {
            if (!FAddFontName(stnFontName.Psz(), &onn, &pglsdlfont))
            {
                Bug("Could not add font to list");
                continue;
            }
        }

        // Add this font
        PSDLFont psdlf;
        AssertDo(psdlf = SDLFontFile::PSDLFontFileNew(&fniFontFile, grfont), "Could not allocate SDL font");
        if (psdlf != pvNil)
            AssertDo(pglsdlfont->FAdd(&psdlf), "Could not add SDL font to font list");

        ReleasePpo(&pglsdlfont);
    }

    return fTrue;
}

/***************************************************************************
    Initialize the font table.
***************************************************************************/
bool NTL::FInit(void)
{
    bool fRet = fFalse;
    PGL pglsdlfont = pvNil;
    int32_t onn;
    int ret;
    FNI fniFontDir, fniDefaultFont;

    // Initialize SDL TTF
    ret = TTF_Init();
    if (ret != 0)
    {
        Bug("TTF_Init failed");
        goto LFail;
    }

    fInitTtf = fTrue;

    // Allocate GST to store font face names
    if (pvNil == (_pgst = GST::PgstNew(sizeof(PGL))))
        goto LFail;

    // FUTURE: Add support for per-user fonts
    if (!FFindSystemFontDir(&fniFontDir))
    {
        Bug("Could not find system fonts directory");
        goto LFail;
    }

    if (!FAddAllFontsInDir(&fniFontDir))
    {
        Bug("Could not add fonts from system fonts directory");
        goto LFail;
    }

    // Ensure we have at least one font
    if (_pgst->IvMac() == 0)
    {
        goto LFail;
    }

    // Add a font to use as the system (default) font
    if (!FAddFontName(PszLit("System Default"), &_onnSystem, &pglsdlfont))
        goto LFail;

    // FUTURE: Embed a default font instead of loading one from disk
    if (FFindDefaultFontFile(&fniFontDir, &fniDefaultFont))
    {
        PSDLFont psdlf;
        AssertDo(psdlf = SDLFontFile::PSDLFontFileNew(&fniDefaultFont, 0), "Could not allocate SDL font");
        if (psdlf != pvNil)
            AssertDo(pglsdlfont->FAdd(&psdlf), "Could not add SDL font to font list");
    }

    fRet = fTrue;

LFail:
    if (!fRet)
        PushErc(ercGfxNoFontList);

    ReleasePpo(&pglsdlfont);
    return fRet;
}

bool NTL::FAddFontName(PCSZ pcszFontName, int32_t *ponn, PGL *pglsdlfont)
{
    AssertSz(pcszFontName);
    AssertPvCb(ponn, SIZEOF(*ponn));
    AssertPvCb(pglsdlfont, SIZEOF(*pglsdlfont));

    bool fRet = fFalse;
    PGL pgl = pvNil;
    STN stnFontName = pcszFontName;

    // Create list to map a font face to SDL fonts
    if (pvNil == (pgl = GL::PglNew(sizeof(PSDLFont), 0)))
        goto LFail;

    fRet = _pgst->FAddStn(&stnFontName, &pgl, ponn);
    Assert(fRet, "Could not add font to list");
    if (fRet)
    {
        // List is now owned by the GST
        pgl->AddRef();

        // Return a reference to the caller
        pgl->AddRef();
        *pglsdlfont = pgl;
    }

LFail:
    ReleasePpo(&pgl);
    return fRet;
}

/***************************************************************************
    Return true iff the font is a fixed pitch font.
***************************************************************************/
bool NTL::FFixedPitch(int32_t onn)
{
    RawRtn();
    return fFalse;
}

TTF_Font *NTL::TtfFontFromDsf(DSF *pdsf)
{
    AssertPo(pdsf, 0);

    PGL pglsdlfont = pvNil;
    TTF_Font *pttf = pvNil;
    int32_t grfontWanted = 0;

    if (pdsf == pvNil)
        return pvNil;

    // Find the list of SDL fonts for this font face number
    _pgst->GetExtra(pdsf->onn, &pglsdlfont);
    if (pglsdlfont == pvNil || pglsdlfont->IvMac() == 0)
        return pvNil;

    if (pglsdlfont->IvMac() == 1)
    {
        PSDLFont *ppsdlfont = (PSDLFont *)pglsdlfont->QvGet(0);
        if (ppsdlfont == pvNil)
            return pvNil;
        if (*ppsdlfont == pvNil)
            return pvNil;
        return (*ppsdlfont)->PttfFont();
    }

    // Go through the font list twice to find the best match
    // First, try for an exact match of font style flags
    // If not found, try matching the font styles with what the font can do
    grfontWanted = pdsf->grfont;
    for (int32_t cact = 0; cact < 2; cact++)
    {
        for (int32_t ifnt = 0; ifnt < pglsdlfont->IvMac(); ifnt++)
        {
            PSDLFont *ppsdlf = (PSDLFont *)pglsdlfont->QvGet(ifnt);
            if (ppsdlf != pvNil && *ppsdlf != pvNil)
            {
                int32_t grfont = (*ppsdlf)->Grfont();

                bool fMatch = fFalse;
                if (cact == 0)
                {
                    fMatch = grfont == grfontWanted;
                }
                else if (cact == 1)
                {
                    fMatch = (grfontWanted != 0) && ((grfontWanted & grfont) == grfontWanted);
                    if (!fMatch)
                    {
                        fMatch = (grfont == fontAll);
                    }
                }

                if (fMatch)
                {
                    pttf = (*ppsdlf)->PttfFont();
                    break;
                }
            }
        }

        if (pttf != pvNil)
        {
            break;
        }
    }

    Assert(pttf != pvNil, "Did not match any font");
    return pttf;
}

TTF_Font *SDLFont::PttfFont()
{
    // Load the font on first use
    if (_ttfFont == pvNil && !_fLoadFailed)
    {
        _fLoadFailed = fTrue;
        SDL_RWops *rwops = GetFontRWops();
        if (rwops != pvNil)
        {
            _ttfFont = TTF_OpenFontRW(rwops, 1, 0);

            if (_ttfFont != pvNil)
            {
                _fLoadFailed = fFalse;
                // The TTF font object now owns the rwops object
                rwops = pvNil;
            }
            else
            {
                PCSZ pszErr = TTF_GetError();
                Assert(0, pszErr);
                PushErc(ercGfxCantSetFont);
            }

            if (rwops != pvNil)
            {
                SDL_RWclose(rwops);
            }
        }
    }

    return _ttfFont;
}

SDLFont::~SDLFont()
{
    // Free font
    if (_ttfFont != pvNil)
    {
        TTF_CloseFont(_ttfFont);
        _ttfFont = pvNil;
    }
}

PSDLFontFile SDLFontFile::PSDLFontFileNew(PFNI pfniFont, int32_t grffont)
{
    PSDLFontFile psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLFontFile))
    {
        PushErc(ercOomNew);
        return pvNil;
    }

    psdlf->_fniFont = *pfniFont;
    psdlf->_grfont = grffont;

    return psdlf;
}

SDL_RWops *SDLFontFile::GetFontRWops()
{
    STN stnFontPath;
    _fniFont.GetStnPath(&stnFontPath);
    U8SZ u8szFontPath;
    stnFontPath.GetUtf8Sz(u8szFontPath);

    SDL_RWops *rwops = SDL_RWFromFile(u8szFontPath, "rb");
    Assert(rwops != pvNil, "Opening file failed!");
    return rwops;
}

PSDLFontMemory SDLFontMemory::PSDLFontMemoryNew(const uint8_t *pbFont, const int32_t cbFont, int32_t grffont)
{
    PSDLFontMemory psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLFontMemory))
    {
        PushErc(ercOomNew);
        return pvNil;
    }

    psdlf->_pbFont = pbFont;
    psdlf->_cbFont = cbFont;
    psdlf->_grfont = grffont;

    return psdlf;
}

SDL_RWops *SDLFontMemory::GetFontRWops()
{
    SDL_RWops *rwops = SDL_RWFromConstMem(_pbFont, _cbFont);
    Assert(rwops != pvNil, "Opening file failed!");
    return rwops;
}