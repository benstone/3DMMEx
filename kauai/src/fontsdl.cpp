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

RTCLASS(SDLFont)
RTCLASS(SDLFontFile)
RTCLASS(SDLFontMemory)

/***************************************************************************
    Load the font using SDL_TTF to get the font face name and style
***************************************************************************/
static bool FGetTtfFontInfo(PFNI pfniFont, PSTN pstnFontName, int32_t *pgrfont)
{
    AssertPo(pfniFont, 0);
    AssertPo(pstnFontName, 0);
    AssertVarMem(pgrfont);

    bool fRet = fFalse;
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

bool NTL::FAddFontFile(PFNI pfniFontFile, PSTN pstnFontName, int32_t *ponn)
{
    AssertPo(pfniFontFile, 0);
    AssertNilOrPo(pstnFontName, 0);
    AssertNilOrVarMem(ponn);

    bool fRet;
    STN stnFontName;
    int grfont;
    bool fUseFont;
    int onn;
    PGL pglsdlfont = pvNil;

    fRet = FGetTtfFontInfo(pfniFontFile, &stnFontName, &grfont);
    if (!fRet)
    {
        goto LFail;
    }

    if (pstnFontName != pvNil)
    {
        stnFontName = *pstnFontName;
    }

    // Get the list of SDL fonts for this font name
    if (_pgst->FFindStn(&stnFontName, &onn, fgstUserSorted))
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
            goto LFail;
        }
    }

    // Add this font
    PSDLFont psdlf;
    AssertDo(psdlf = SDLFontFile::PSDLFontFileNew(pfniFontFile, grfont), "Could not allocate SDL font");
    if (psdlf != pvNil)
    {
        if (!pglsdlfont->FAdd(&psdlf))
        {
            Bug("Could not add SDL font to font list");
            ReleasePpo(&psdlf);
        }
    }

    fRet = fTrue;

    if (ponn != pvNil)
    {
        *ponn = onn;
    }

LFail:
    ReleasePpo(&pglsdlfont);
    return fRet;
}

bool NTL::FAddAllFontsInDir(PFNI pfniFontDir)
{
    AssertPo(pfniFontDir, 0);

    FTG rgftgFont[] = {kftgTtf, kftgTtc, kftgOtf};
    FNE fneFontFiles;
    FNI fniFontFile;

    // Find all font files in the font directory
    if (!fneFontFiles.FInit(pfniFontDir, rgftgFont, CvFromRgv(rgftgFont), ffneNil))
    {
        Bug("Could not initialise font directory enumerator");
        return fFalse;
    }

    while (fneFontFiles.FNextFni(&fniFontFile))
    {
        AssertDo(FAddFontFile(&fniFontFile), "Failed to add font");
    }

    return fTrue;
}

/***************************************************************************
    Initialize the font table.
***************************************************************************/
bool NTL::FInit(void)
{
    bool fRet = fFalse;
    int ttfret;

    // Initialize SDL TTF
    ttfret = TTF_Init();
    if (ttfret != 0)
    {
        Bug(TTF_GetError());
        goto LFail;
    }

    fInitTtf = fTrue;

    // Allocate GST to store font face names
    if (pvNil == (_pgst = GST::PgstNew(sizeof(PGL))))
        goto LFail;

    // Load fonts
    if (!_FLoadFontTable())
        goto LFail;

    Assert(_pgst->IvMac() > 0, "No fonts loaded");
    Assert(_onnSystem != 0, "System font number not set");

    if (_pgst->IvMac() == 0)
        goto LFail;

    fRet = fTrue;

LFail:
    if (!fRet)
        PushErc(ercGfxNoFontList);

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
    int32_t onn;

    // Create list to map a font face to SDL fonts
    if (pvNil == (pgl = GL::PglNew(sizeof(PSDLFont), 0)))
        goto LFail;

    // Check if the font name already exists
    // This also gets the position to insert the font name
    if (_pgst->FFindStn(&stnFontName, &onn, fgstUserSorted))
        goto LFail;

    fRet = _pgst->FInsertStn(onn, &stnFontName, &pgl);
    Assert(fRet, "Could not add font to list");
    if (fRet)
    {
        // List is now owned by the GST
        pgl->AddRef();

        // Return a reference to the caller
        pgl->AddRef();
        *pglsdlfont = pgl;
        *ponn = onn;
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
        return (*ppsdlfont)->PttfFont(pdsf->dyp);
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
                    pttf = (*ppsdlf)->PttfFont(pdsf->dyp);
                    break;
                }
            }
        }

        if (pttf != pvNil)
        {
            break;
        }
    }

    if (pttf == pvNil)
    {
        Warn("Failed to match font");
        PSDLFont *ppsdlf = (PSDLFont *)pglsdlfont->QvGet(0);
        pttf = (*ppsdlf)->PttfFont(pdsf->dyp);
    }

    Assert(pttf != pvNil, "Did not match any font");
    return pttf;
}

TTF_Font *SDLFont::PttfFont(int32_t dyp)
{
    // Check if we already failed to load the font
    if (_fLoadFailed)
        return pvNil;

    // Check if we have already loaded a font of this size
    if (_pglinstance != pvNil)
    {
        for (int32_t iinstance = 0; iinstance < _pglinstance->IvMac(); iinstance++)
        {
            SDLFont::Instance *pinstance = (SDLFont::Instance *)_pglinstance->QvGet(iinstance);
            if (pinstance != pvNil && pinstance->dyp == dyp)
            {
                Assert(pinstance->pttffont != pvNil, "pttffont in instance nil");
                return pinstance->pttffont;
            }
        }
    }

    // Allocate the font instance list if we haven't already
    if (_pglinstance == pvNil)
    {
        _pglinstance = GL::PglNew(sizeof(SDLFont::Instance), 1);
        if (_pglinstance == pvNil)
        {
            PushErc(ercOomNew);
            return pvNil;
        }
    }

    // Load the font
    _fLoadFailed = fTrue;
    SDL_RWops *rwops = GetFontRWops();
    TTF_Font *pttffont = pvNil;
    if (rwops != pvNil)
    {
        pttffont = TTF_OpenFontRW(rwops, 1, dyp);

        if (pttffont != pvNil)
        {
            _fLoadFailed = fFalse;

            // Add the font to the font list
            SDLFont::Instance instance;
            instance.dyp = dyp;
            instance.pttffont = pttffont;

            if (!_pglinstance->FAdd(&instance))
            {
                Bug("Could not add font instance to font instance list");
                TTF_CloseFont(pttffont);
                pttffont = pvNil;
            }

            // rwops is freed when the TTF font is closed
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

    return pttffont;
}

SDLFont::~SDLFont()
{
    // Free font instances
    if (_pglinstance != pvNil)
    {
        for (int32_t iinstance = 0; iinstance < _pglinstance->IvMac(); iinstance++)
        {
            SDLFont::Instance *pinstance = (SDLFont::Instance *)_pglinstance->QvGet(iinstance);
            TTF_CloseFont(pinstance->pttffont);
        }
        ReleasePpo(&_pglinstance);
    }
}

#ifdef DEBUG

void SDLFont::AssertValid(uint32_t grf)
{
    SDLFont_PAR::AssertValid(0);
    AssertNilOrPo(_pglinstance, 0);
}

void SDLFont::MarkMem(void)
{
    SDLFont_PAR::MarkMem();
    if (_pglinstance)
    {
        _pglinstance->MarkMem();
    }
}

#endif // DEBUG

PSDLFontFile SDLFontFile::PSDLFontFileNew(PFNI pfniFont, int32_t grffont)
{
    PSDLFontFile psdlf = pvNil;

    if (pvNil == (psdlf = NewObj SDLFontFile))
    {
        PushErc(ercOomNew);
        return pvNil;
    }

    psdlf->_pglinstance = pvNil;
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

    psdlf->_pglinstance = pvNil;
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
