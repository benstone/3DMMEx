/***************************************************************************

    portfnative.cpp: Portfolio using Native File Dialog Extended

***************************************************************************/
#include "studio.h"
#include <nfd.h>

ASSERTNAME

/***************************************************************************
    Translate file filter to format used by NFD
***************************************************************************/
static void TranslateFilterExtension(PU8SZ pszFilterExt, PSTN pstnFilterExt)
{
    AssertPo(pstnFilterExt, 0);

    STN stnTranslated;

    // Win32 common dialogs use the following format: "*.3mm;*.wav"
    // NFD expects the following format: "3mm,wav"
    // Strip out wildcard characters and replace semicolons with commas

    stnTranslated.SetNil();
    for (int32_t ich = 0; ich < pstnFilterExt->Cch(); ich++)
    {
        achar ch = pstnFilterExt->Psz()[ich];

        switch (ch)
        {
        case ChLit('*'):
            ch = chNil;
            break;
        case ChLit('.'):
            ch = chNil;
            break;
        case ChLit(';'):
            ch = ChLit(',');
            break;
        default:
            break;
        }

        if (ch != chNil)
        {
            AssertDo(stnTranslated.FAppendCh(ch), 0);
        }
    }

    Assert(stnTranslated.Cch() > 0, "Empty filter");
    stnTranslated.GetUtf8Sz(pszFilterExt);
}

bool FPortDisplayWithIds(FNI *pfni, bool fOpen, int32_t lFilterLabel, int32_t lFilterExt, int32_t lTitle,
                         PCSZ lpstrDefExt, PSTN pstnDefFileName, FNI *pfniInitialDir, uint32_t grfPrevType, CNO cnoWave)
{
    AssertVarMem(pfni);
    AssertNilOrPo(pstnDefFileName, 0);
    AssertNilOrPo(pfniInitialDir, 0);

    bool fRet = fFalse;
    STN stnT;
    U8SZ u8szInitialDir;
    U8SZ u8szFilterLabel;
    U8SZ u8szFilterExt;
    U8SZ u8szDefFileName;
    nfdresult_t nfdret;
    nfdu8char_t *nfdu8Path = pvNil;
    const int32_t cfilteritem = 1;
    nfdu8filteritem_t rgfilteritem[cfilteritem];

    // Get initial directory
    if (pfniInitialDir != pvNil)
    {
        pfniInitialDir->GetStnPath(&stnT);
    }
    else
    {
        stnT.SetNil();
    }
    stnT.GetUtf8Sz(u8szInitialDir);

    // Get default file name
    u8szDefFileName[0] = chNil;
    if (pstnDefFileName != pvNil)
    {
        pstnDefFileName->GetUtf8Sz(u8szDefFileName);
    }

    // Get file format filter strings
    if (!vapp.FGetStnApp(lFilterLabel, &stnT))
        goto LDone;
    stnT.GetUtf8Sz(u8szFilterLabel);

    if (!vapp.FGetStnApp(lFilterExt, &stnT))
        goto LDone;

    // Build filter list
    TranslateFilterExtension(u8szFilterExt, &stnT);

    ClearPb(rgfilteritem, SIZEOF(rgfilteritem));
    rgfilteritem[0].name = u8szFilterLabel;
    rgfilteritem[0].spec = u8szFilterExt;

    nfdret = NFD_Init();
    if (nfdret != NFD_OKAY)
    {
        Bug(NFD_GetError());
        PushErc(ercSocPortfolioFailed);
        goto LDone;
    }

    StopAllMovieSounds();
    vapp.EnsureInteractive();
    vapp.SetFInPortfolio(fTrue);

    // Play sound associated with this portfolio
    if (cnoWave != cnoNil)
    {
        PCRF pcrf;
        if ((pcrf = ((APP *)vpappb)->PcrmAll()->PcrfFindChunk(kctgWave, cnoWave)) != pvNil)
        {
            vpsndm->SiiPlay(pcrf, kctgWave, cnoWave);
        }
    }

    // Show the dialog
    if (fOpen)
    {
        nfdret = NFD_OpenDialogU8(&nfdu8Path, rgfilteritem, cfilteritem, u8szInitialDir);
    }
    else
    {
        nfdret = NFD_SaveDialogU8(&nfdu8Path, rgfilteritem, cfilteritem, u8szInitialDir, u8szDefFileName);
    }

    // Get the selected path
    if (nfdret == NFD_OKAY)
    {
        stnT.SetUtf8Sz(nfdu8Path);
        fRet = pfni->FBuildFromPath(&stnT, 0);
    }
    else
    {
        Assert(nfdret == NFD_CANCEL, NFD_GetError());
        if (nfdret != NFD_CANCEL)
            PushErc(ercSocPortfolioFailed);

        pfni->SetNil();
    }

LDone:
    vpsndm->StopAll(sqnNil, sclNil);
    vapp.SetFInPortfolio(fFalse);

    // Notify scripts that the portfolio was closed
    vpcex->EnqueueCid(cidPortfolioClosed, 0, 0, fRet);
    vpcex->EnqueueCid(cidPortfolioResult, 0, 0, fRet);

    if (nfdu8Path != pvNil)
        NFD_FreePathU8(nfdu8Path);

    NFD_Quit();
    return fRet;
}