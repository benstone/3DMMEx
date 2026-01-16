/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Miniaudio cached sound

***************************************************************************/

#include "frame.h"
ASSERTNAME

#include "sndmapri.h"

// Sound files smaller than this size will be stored in memory
const int32_t kcbSoundMax = 64 * 1024;

RTCLASS(MiniaudioCachedSound);

MiniaudioCachedSound::MiniaudioCachedSound()
{
    // do nothing
}

bool MiniaudioCachedSound::FReadMiniaudioCachedSound(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco,
                                                     int32_t *pcb)
{
    AssertPo(pcrf, 0);
    AssertPo(pblck, 0);
    AssertNilOrVarMem(ppbaco);
    AssertVarMem(pcb);
    FLO flo;
    bool fPacked;
    PMiniaudioCachedSound pmacsound = pvNil;

    *pcb = SIZEOF(PMiniaudioCachedSound);
    if (pvNil == ppbaco)
        return fTrue;

    *ppbaco = pvNil;
    if (!pcrf->Pcfl()->FFindFlo(ctg, cno, &flo))
        return fFalse;

    fPacked = pcrf->Pcfl()->FPacked(ctg, cno);

    if (pvNil == (pmacsound = MiniaudioCachedSound::PMiniaudioCachedSoundNew(&flo, fPacked)))
        return fFalse;

    AssertNilOrPo(pmacsound, 0);
    *ppbaco = pmacsound;
    return pvNil != *ppbaco;
}

PMiniaudioCachedSound MiniaudioCachedSound::PMiniaudioCachedSoundNew(PFLO pflo, bool fPacked)
{
    AssertPo(pflo, ffloReadable);
    PMiniaudioCachedSound pmacsound = pvNil;

    if (pvNil == (pmacsound = NewObj MiniaudioCachedSound))
        return pvNil;

    // Decompress the sound if required
    if (fPacked)
    {
        pmacsound->_blckData.Set(pflo, fPacked);
        if (!pmacsound->_blckData.FUnpackData())
        {
            ReleasePpo(&pmacsound);
            return pvNil;
        }
    }
    else
    {

        pmacsound->_blckData.Set(pflo);

        // Cache the data in memory if it's small enough
        if (pmacsound->_blckData.Cb() < kcbSoundMax)
        {
            HQ hqSound = hqNil;
            if (pmacsound->_blckData.FReadHq(&hqSound))
            {
                // Block takes ownership of the HQ
                pmacsound->_blckData.SetHq(&hqSound);
            }
            FreePhq(&hqSound);
        }
    }

    // Cleanup
    AssertPo(pmacsound, 0);
    return pmacsound;
}

PBLCK MiniaudioCachedSound::Pblck()
{
    AssertThis(0);
    return &_blckData;
}

MiniaudioCachedSound::~MiniaudioCachedSound()
{
    _blckData.Free();
}

#ifdef DEBUG
void MiniaudioCachedSound::AssertValid(uint32_t grf)
{
    MiniaudioCachedSound_PAR::AssertValid(0);
    AssertPo(&_blckData, 0);
}

void MiniaudioCachedSound::MarkMem()
{
    MiniaudioCachedSound_PAR::MarkMem();
    MarkMemObj(&_blckData);
}
#endif // DEBUG
