/***************************************************************************

    portfstub.cpp: Portfolio stub

***************************************************************************/
#include "studio.h"

ASSERTNAME

bool FPortDisplayWithIds(FNI *pfni, bool fOpen, int32_t lFilterLabel, int32_t lFilterExt, int32_t lTitle,
                         PCSZ lpstrDefExt, PSTN pstnDefFileName, FNI *pfniInitialDir, uint32_t grfPrevType, CNO cnoWave)
{
    Bug("Portfolio not implemented on this platform");

    // Notify scripts that the portfolio was closed
    vpcex->EnqueueCid(cidPortfolioClosed, 0, 0, fFalse);
    vpcex->EnqueueCid(cidPortfolioResult, 0, 0, fFalse);

    return fFalse;
}