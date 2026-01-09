/***************************************************************************
    Author: Ben Stone
    Project: Kauai

    Miniaudio sound device implementation

***************************************************************************/
#ifndef SNDMAPRI_H
#define SNDMAPRI_H

// Cached object containing raw sound data
typedef class MiniaudioCachedSound *PMiniaudioCachedSound;
#define MiniaudioCachedSound_PAR BACO
#define kclsMiniaudioCachedSound KLCONST4('m', 'a', 's', 'n')
class MiniaudioCachedSound : public MiniaudioCachedSound_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    NOCOPY(MiniaudioCachedSound)
  public:
    int32_t CbMem(void);

    // Load sound data from a chunky resource file
    static bool FReadMiniaudioCachedSound(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);

    static PMiniaudioCachedSound PMiniaudioCachedSoundNew(PFLO pflo, bool fPacked);

    // Return the block containing raw sound data
    PBLCK Pblck();

  protected:
    MiniaudioCachedSound();
    virtual ~MiniaudioCachedSound();

    // Block containing the sound data
    BLCK _blckData;
};

// Scale volume to a float from 0.0 to 2.0
float ScaleVlm(int32_t vlm);

#endif // SNDMAPRI_H