/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    msnd.cpp: Movie Sound class

    Primary Authors: *****, *****
    Status:  Reviewed

    A MSND (movie sound) owns a MIDI or WAVE child chunk, and also
    specifies what sound type (sty) this sound is, and the default
    volume for the sound.

    Here's how the chunks look:

    MSND
     |
     +---MIDI or WAVE (chid 0) // actual sound data

    An MSND chunk with no child is a "no sound" or silent sound.
    An MSND chunk with _fInvalid set requires no child.

***************************************************************************/
#include "soc.h"
#include "miniaudio.h"

ASSERTNAME

RTCLASS(MSND)
RTCLASS(MSQ)

BEGIN_CMD_MAP(MSQ, CMH)
ON_CID_ME(cidAlarm, &MSQ::FCmdAlarm, pvNil)
END_CMD_MAP_NIL()

// Sound format for high quality import
const ma_format kfmtHigh = ma_format_s16;
const ma_uint32 kcchanHigh = 2;
const ma_uint32 klwSampleRateHigh = 44100;

// Sound format for low quality import
const ma_format kfmtLow = ma_format_u8;
const ma_uint32 kcchanLow = 1;
const ma_uint32 klwSampleRateLow = 11025;

/***************************************************************************

    A PFNRPO to read a MSND from a file

***************************************************************************/
bool MSND::FReadMsnd(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb)
{
    AssertPo(pcrf, 0);
    AssertPo(pblck, 0);
    AssertNilOrVarMem(ppbaco);
    AssertVarMem(pcb);

    MSND *pmsnd;

    *pcb = SIZEOF(MSND); // estimate MSND size
    if (pvNil == ppbaco)
        return fTrue;

    pmsnd = NewObj MSND();
    if (pvNil == pmsnd || !pmsnd->_FInit(pcrf->Pcfl(), ctg, cno))
    {
        TrashVar(ppbaco);
        TrashVar(pcb);
        ReleasePpo(&pmsnd);
        return fFalse;
    }

    pmsnd->_prca = pcrf;
    AssertPo(pmsnd, 0);
    *ppbaco = pmsnd;
    return fTrue;
}

/***************************************************************************

    Retrieve information contained in the msnd chunk

***************************************************************************/
bool MSND::FGetMsndInfo(PCFL pcfl, CTG ctg, CNO cno, bool *pfInvalid, int32_t *psty, int32_t *pvlm)
{
    AssertPo(pcfl, 0);

    PMSND pmsnd;
    pmsnd = NewObj MSND();
    if (pvNil == pmsnd)
        return pvNil;

    if (!pmsnd->_FInit(pcfl, ctg, cno))
    {
        ReleasePpo(&pmsnd);
        return fFalse;
    }

    if (pvNil != pfInvalid)
        *pfInvalid = pmsnd->_fInvalid;
    if (pvNil != psty)
        *psty = pmsnd->_sty;
    if (pvNil != pvlm)
        *pvlm = pmsnd->_vlm;
    ReleasePpo(&pmsnd);
    return fTrue;
}

/***************************************************************************

    Init a MSND from the given chunk of the given CFL

***************************************************************************/
bool MSND::_FInit(PCFL pcfl, CTG ctg, CNO cno)
{
    AssertBaseThis(0);
    AssertPo(pcfl, 0);

    BLCK blck;
    MSNDF msndf;
    KID kid;

    if (!pcfl->FFind(ctg, cno, &blck) || !blck.FUnpackData())
        goto LFail;
    if (blck.Cb() > SIZEOF(MSNDF))
        goto LFail;
    if (!blck.FReadRgb(&msndf, SIZEOF(MSNDF), 0))
        goto LFail;
    if (kboCur != msndf.bo)
        SwapBytesBom(&msndf, kbomBkgdf);
    Assert(kboCur == msndf.bo, "bad MSNDF");

    if (!pcfl->FGetName(ctg, cno, &_stn))
        return fFalse;

    _sty = msndf.sty;
    _vlm = msndf.vlmDefault;
    _fInvalid = FPure(msndf.fInvalid);
    if (_fInvalid)
        return fTrue;

    // If there is a SND child, it is not a "no sound"
    if (pcfl->FGetKidChid(ctg, cno, kchidSnd, &kid))
    {
        _cnoSnd = kid.cki.cno;
        _ctgSnd = kid.cki.ctg;
        _fNoSound = tribool::tNo;
    }
    else
        _fNoSound = tribool::tYes;

    return fTrue;
LFail:
    return fFalse;
}

/***************************************************************************

    Write an MSND MIDI chunk to file *pcfl
    ie, write the MSND chunk, its name, and the midi child

***************************************************************************/
bool MSND::FWriteMidi(PCFL pcflDest, PMIDS pmids, STN *pstnName, CNO *pcno)
{
    AssertPo(pcflDest, 0);
    AssertPo(pmids, 0);
    AssertVarMem(pstnName);
    AssertVarMem(pcno);

    MSNDF msndf;
    BLCK blck;
    CNO cno;

    msndf.bo = kboCur;
    msndf.osk = koskCur;
    msndf.sty = styMidi;
    msndf.vlmDefault = kvlmFull;
    msndf.fInvalid = fFalse;

    // Create the msnd chunk
    if (!pcflDest->FAddPv(&msndf, SIZEOF(MSNDF), kctgMsnd, pcno))
        return fFalse;

    // Create the midi chunk as a child of the msnd chunk
    if (!pcflDest->FAddChild(kctgMsnd, *pcno, kchidSnd, pmids->CbOnFile(), kctgMidi, &cno, &blck))
        goto LFail;

    if (!pmids->FWrite(&blck))
        goto LFail;

    if (!pcflDest->FSetName(kctgMsnd, *pcno, pstnName))
        goto LFail;

    return fTrue;

LFail:
    pcflDest->Delete(kctgMsnd, *pcno); // Deletes the midi chunk also
    return fFalse;
}

/***************************************************************************

    Write an MSND Wave file to a file
    ie, write the MSND chunk, its name, and the midi child

***************************************************************************/
bool MSND::FWriteWave(PFIL pfilSrc, PCFL pcflDest, int32_t sty, STN *pstnName, CNO *pcno)
{
    AssertPo(pfilSrc, 0);
    AssertIn(sty, 0, styLim);
    AssertVarMem(pstnName);
    AssertVarMem(pcno);

    MSNDF msndf;
    CNO cno;
    FLO floSrc;
    FLO floDest;

    msndf.bo = kboCur;
    msndf.osk = koskCur;
    msndf.sty = sty;
    msndf.vlmDefault = kvlmFull;
    msndf.fInvalid = fFalse;

    floSrc.pfil = pfilSrc;
    floSrc.cb = pfilSrc->FpMac();
    floSrc.fp = 0;

    // Create the msnd chunk
    if (!pcflDest->FAddPv(&msndf, SIZEOF(MSNDF), kctgMsnd, pcno))
        return fFalse;

    // Create the wave chunk as a child of the msnd chunk
    if (!pcflDest->FAddChild(kctgMsnd, *pcno, kchidSnd, floSrc.cb, kctgWave, &cno))
        goto LFail;

    if (!pcflDest->FFindFlo(kctgWave, cno, &floDest))
        goto LFail;

    if (!floSrc.FCopy(&floDest))
        goto LFail;

    if (!pcflDest->FSetName(kctgMsnd, *pcno, pstnName))
        goto LFail;

    return fTrue;

LFail:
    pcflDest->Delete(kctgMsnd, *pcno); // Deletes the wave chunk also
    return fFalse;
}

/***************************************************************************

    Copy the midi file to a chunk in the current movie
    The *pcno is returned

***************************************************************************/
bool MSND::FCopyMidi(PFIL pfilSrc, PCFL pcflDest, CNO *pcno, PSTN pstn)
{
    AssertPo(pfilSrc, 0);
    AssertNilOrPo(pstn, 0);

    PMIDS pmids = pvNil;
    FNI fniSrc;
    STN stnName;

    pfilSrc->GetFni(&fniSrc);
    if (pvNil == pstn)
        fniSrc.GetLeaf(&stnName);
    else
        stnName = *pstn;

    pmids = MIDS::PmidsReadNative(&fniSrc);
    if (pmids == pvNil)
    {
        PushErc(ercSocBadSoundFile);
        goto LFail;
    }

    // Create the chunk & write it to this movie
    // Adopt it later as a child of kctgMvie
    if (!MSND::FWriteMidi(pcflDest, pmids, &stnName, pcno))
        goto LFail;

    ReleasePpo(&pmids);
    return fTrue;

LFail:
    ReleasePpo(&pmids);
    return fFalse;
}

/***************************************************************************

    Copy the wave file to a chunk in the current movie

***************************************************************************/
bool MSND::FCopyWave(PFIL pfilSrc, PCFL pcflDest, int32_t sty, CNO *pcno, PSTN pstn)
{
    AssertPo(pfilSrc, 0);
    AssertPo(pcflDest, 0);
    AssertIn(sty, 0, styLim);
    AssertVarMem(pcno);
    Assert(sty != styMidi, "Illegal sty argument");
    AssertNilOrPo(pstn, 0);

    bool fRet = fFalse;
    FNI fniSrc;
    STN stnName; // sound name
    STN stnSrc;  // src file path name
    STN stnNew;  // temp file path
    bool fCompress = fTrue;
    int32_t lwProp = 0;
    ma_result result;
    ma_decoder decoder;
    ma_decoder_config decodercfg;
    bool fInitDecoder = fFalse;
    ma_encoder encoder;
    ma_encoder_config encodercfg;
    bool fInitEncoder = fFalse;
    FNI fniNew;
    PFIL pfilNew = pvNil;
    ma_uint8 rgbFrames[8192];

    ClearPb(rgbFrames, SIZEOF(rgbFrames));

    // Check if high quality sound import is enabled
    // This option skips downsampling the imported file to 11M8
    if (vpappb->FGetProp(kpridHighQualitySoundImport, &lwProp))
    {
        fCompress = !(FPure(lwProp));
    }

    pfilSrc->GetFni(&fniSrc);
    if (pvNil == pstn)
        fniSrc.GetLeaf(&stnName);
    else
        stnName = *pstn;
    fniSrc.GetStnPath(&stnSrc);

    // Note: We always re-encode the file to ensure it is uncompressed PCM.
    // This avoids issues with missing audio codecs.
    // fCompress here means downsample to the low-fi sound of old 3DMM.
    // FUTURE: 3DMM also encoded the sound files with ADPCM. We could
    // implement that if we want it to sound worse/more authentic!

    if (fCompress)
        decodercfg = ma_decoder_config_init(kfmtLow, kcchanLow, klwSampleRateLow);
    else
        decodercfg = ma_decoder_config_init(kfmtHigh, kcchanHigh, klwSampleRateHigh);

    encodercfg =
        ma_encoder_config_init(ma_encoding_format_wav, decodercfg.format, decodercfg.channels, decodercfg.sampleRate);

    // Open the source file
    result = ma_decoder_init_file(stnSrc.Psz(), &decodercfg, &decoder);
    AssertVar(result == MA_SUCCESS, "ma_decoder_init_file failed", &result);
    if (result != MA_SUCCESS)
        goto LFail;
    fInitDecoder = fTrue;

    // Create the encoder
    if (!fniNew.FGetTemp())
    {
        Bug("Could not create a temp path");
        goto LFail;
    }
    fniNew.GetStnPath(&stnNew);

    result = ma_encoder_init_file(stnNew.Psz(), &encodercfg, &encoder);
    AssertVar(result == MA_SUCCESS, "ma_encoder_init_file", &result);
    if (result != MA_SUCCESS)
        goto LFail;
    fInitEncoder = fTrue;

    // Copy frames from the decoder to the encoder
    while (fTrue)
    {
        ma_uint64 cframesRead =
            SIZEOF(rgbFrames) / ma_get_bytes_per_frame(decoder.outputFormat, decoder.outputChannels);

        result = ma_decoder_read_pcm_frames(&decoder, rgbFrames, cframesRead, &cframesRead);
        if (result != MA_SUCCESS && !(result == MA_AT_END && cframesRead > 0))
            break;

        ma_uint64 cframesWritten = 0;
        result = ma_encoder_write_pcm_frames(&encoder, rgbFrames, cframesRead, &cframesWritten);
        AssertVar(result == MA_SUCCESS, "ma_encoder_write_pcm_frames failed", &result);
        Assert(cframesRead == cframesWritten, "didn't write all frames");
        if (result != MA_SUCCESS)
            break;
    }

    AssertVar(result == MA_AT_END, "failed to re-encode sound", &result);
    if (result != MA_AT_END)
        goto LFail;

    ma_encoder_uninit(&encoder);
    fInitEncoder = fFalse;

    // Copy the encoded sound into the movie
    pfilNew = FIL::PfilOpen(&fniNew, ffilNil);
    AssertPo(pfilNew, 0);
    if (!pfilNew)
        goto LFail;
    Assert(pfilNew->FpMac() != 0, "encoded file is empty?");

    fRet = MSND::FWriteWave(pfilNew, pcflDest, sty, &stnName, pcno);

LFail:
    if (fInitDecoder)
        AssertDo(ma_decoder_uninit(&decoder) == MA_SUCCESS, "Could not uninitialise decoder");
    if (fInitEncoder)
        ma_encoder_uninit(&encoder);
    ReleasePpo(&pfilNew);

    if (fniNew.TExists() == tYes)
        AssertDo(fniNew.FDelete(), "Could not clean up temp file");

    if (!fRet)
        PushErc(ercSocBadSoundFile);

    return fRet;
}

/***************************************************************************

    Invalidate a sound

***************************************************************************/
bool MSND::FInvalidate(void)
{
    AssertThis(0);

    KID kid;
    MSNDF msndf;

    // Invalidate the msnd on file
    if (!Pcrf()->Pcfl()->FGetKidChid(kctgMsnd, Cno(), kchidSnd, &kid))
        return fFalse;
    msndf.bo = kboCur;
    msndf.osk = koskCur;
    msndf.sty = _sty;
    msndf.vlmDefault = _vlm;
    msndf.fInvalid = fTrue;
    if (!Pcrf()->Pcfl()->FPutPv(&msndf, SIZEOF(MSNDF), Ctg(), Cno()))
        return fFalse;
    Pcrf()->Pcfl()->DeleteChild(Ctg(), Cno(), kid.cki.ctg, kid.cki.cno);

    // Invalidate the cache representation
    _fInvalid = fTrue;
    return fTrue;
}

/***************************************************************************

    Clean up and delete this movie sound

***************************************************************************/
MSND::~MSND(void)
{
    AssertBaseThis(0);
}

/***************************************************************************

    Return the sqn for an msnd attached to an actor object of
    id == objid
    Static function

***************************************************************************/
int32_t MSND::SqnActr(int32_t sty, int32_t objid)
{
    AssertIn(sty, 0, styLim);

    int32_t sqnsty = sty << ksqnStyShift;
    return (sqnActr | sqnsty | SwLow(objid));
}

/***************************************************************************

    Return the sqn for an msnd attached to an actor object of
    id == objid
    Static function

***************************************************************************/
int32_t MSND::SqnBkgd(int32_t sty, int32_t objid)
{
    int32_t sqnsty = sty << ksqnStyShift;
    return (sqnBkgd | sqnsty | SwLow(objid));
}

/***************************************************************************

    Return the priority for a tool,sty combination

***************************************************************************/
int32_t MSND::Spr(int32_t tool)
{
    AssertThis(0);
    Assert(tool == toolMatcher || tool == toolSounder || tool == toolLooper, "Invalid tool");

    switch (_sty)
    {
    case styMidi:
        Assert(tool != toolMatcher, "No midi motion matching");
        return 1;
        break;
    case stySpeech:
        if (tool == toolSounder)
            return 1;
        if (tool == toolMatcher)
            return 5;
        return 3;
        break;
    case stySfx:
        if (tool == toolSounder)
            return 2;
        if (tool == toolMatcher)
            return 6;
        return 4;
    default:
        Assert(0, "Invalid sty in MSND: Spr");
    }
    return 0;
}

/***************************************************************************

    Play this sound

***************************************************************************/
void MSND::Play(int32_t objID, bool fLoop, bool fQueue, int32_t vlm, int32_t spr, bool fActr, uint32_t dtsStart)
{
    AssertThis(0);

    int32_t cactRepeat;
    int32_t sqn; // sound queue
    int32_t scl; // sound class
    int32_t sii{};

    static int32_t _siiLastMidi;
    static CTG _ctgLastMidi;
    static CNO _cnoLastMidi;

    if (_fInvalid)
        return;

    sqn = fActr ? SqnActr(objID) : SqnBkgd(objID);
    cactRepeat = fLoop ? klwMax : 1;
    scl = Scl(fLoop);

    if (_sty == styMidi && _ctgSnd == _ctgLastMidi && _cnoSnd == _cnoLastMidi && vpsndm->FPlaying(_siiLastMidi))
    {
        // Don't restart midi if the same sound is still playing
        return;
    }

    if (!fQueue || _fNoSound)
        vpsndm->StopAll(sqn, sclNil);

    if (!_fNoSound)
    {
        sii = vpsndm->SiiPlay(_prca, _ctgSnd, _cnoSnd, sqn, vlm, cactRepeat, dtsStart, spr, scl);
    }

    if (_sty == styMidi)
    {
        _siiLastMidi = sii;
        _ctgLastMidi = _ctgSnd;
        _cnoLastMidi = _cnoSnd;
    }
}

/***************************************************************************

    New MSQ

***************************************************************************/
PMSQ MSQ::PmsqNew(void)
{
    PMSQ pmsq;
    if (pvNil == (pmsq = NewObj MSQ(khidMsq)))
        return pvNil;

    if (pvNil == (pmsq->_pglsqe = GL::PglNew(SIZEOF(SQE), kcsqeGrow)))
    {
        ReleasePpo(&pmsq);
        return pvNil;
    }

    if (pvNil == (pmsq->_pclok = NewObj CLOK(khidMsqClock)))
    {
        ReleasePpo(&pmsq);
        return pvNil;
    }

    pmsq->_dtim = kdtim2Msq;
    return pmsq;
}

/***************************************************************************

    Enqueue a sound	in the MSQ.  Overwrites sounds of the same type.

***************************************************************************/
bool MSQ::FEnqueue(PMSND pmsnd, int32_t objID, bool fLoop, bool fQueue, int32_t vlm, int32_t spr, bool fActr,
                   uint32_t dtsStart, bool fLowPri)
{
    AssertThis(0);
    AssertPo(pmsnd, 0);

    SQE sqe;
    SQE *psqe;
    int32_t sqn;
    int32_t sqnT;
    int32_t isqe;

    if (_dtim == kdtimOffMsq)
        return fTrue;

    sqn = fActr ? MSND::SqnActr(pmsnd->Sty(), objID) : MSND::SqnBkgd(pmsnd->Sty(), objID);

    if (!fQueue)
        for (isqe = 0; isqe < _pglsqe->IvMac(); isqe++)
        {
            psqe = (SQE *)_pglsqe->QvGet(isqe);
            sqnT = psqe->fActr ? MSND::SqnActr(psqe->pmsnd->Sty(), psqe->objID)
                               : MSND::SqnBkgd(psqe->pmsnd->Sty(), psqe->objID);
            if (sqnT == sqn)
            {
                if (fLowPri)
                    return fTrue; // Nothing to enqueue;  same type already taken
                // Hi priority.  Get rid of lower priority sound.
                ReleasePpo(&psqe->pmsnd);
                _pglsqe->Delete(isqe);
                break;
            }
        }

    sqe.pmsnd = pmsnd;
    pmsnd->AddRef();
    sqe.objID = objID;
    sqe.fLoop = fLoop;
    sqe.fQueue = fQueue;
    sqe.vlmMod = vlm;
    sqe.spr = spr;
    sqe.fActr = fActr;
    sqe.dtsStart = dtsStart;

    if (fLowPri)
    {
        if (!_pglsqe->FPush(&sqe))
        {
            ReleasePpo(&sqe.pmsnd);
            return fFalse;
        }
    }
    else if (!_pglsqe->FEnqueue(&sqe))
    {
        ReleasePpo(&sqe.pmsnd);
        return fFalse;
    }

    return fTrue;
}

/***************************************************************************

    Dequeue and Play the MSQ sounds
    If _dtim == kdtimOff, empty the queue

***************************************************************************/
void MSQ::PlayMsq(void)
{
    AssertThis(0);

    SQE sqe;

    if (_pglsqe->IvMac() == 0)
        return;

    if (_dtim == kdtimOffMsq)
    {
        FlushMsq();
        return;
    }

    if (0 < _pglsqe->IvMac())
    {
        vpsndm->BeginSynch();

        while (_pglsqe->FDequeue(&sqe))
        {
            sqe.pmsnd->Play(sqe.objID, sqe.fLoop, sqe.fQueue, sqe.vlmMod, sqe.spr, sqe.fActr, sqe.dtsStart);
            ReleasePpo(&sqe.pmsnd);
        }

        vpsndm->EndSynch();
    }

    if (_dtim < kdtimLongMsq)
    {
        _pclok->Start(0);
        if (!_pclok->FSetAlarm(_dtim, this))
        {
            StopAll();
            return;
        }
    }

    return;
}

/***************************************************************************

    Flush Queue	 -  without playing the sounds

***************************************************************************/
void MSQ::FlushMsq(void)
{
    AssertThis(0);
    SQE sqe;

    while (_pglsqe->FDequeue(&sqe))
    {
        ReleasePpo(&sqe.pmsnd);
    }
}

/***************************************************************************

    FCmdAlarm - Timeout has elapsed.  Stop all sounds

***************************************************************************/
bool MSQ::FCmdAlarm(PCMD pcmd)
{
    AssertThis(0);
    AssertVarMem(pcmd);

    _pclok->Stop();
    StopAll();
    return fTrue;
}

/***************************************************************************

    Clean up and delete this movie sound queue

***************************************************************************/
MSQ::~MSQ(void)
{
    AssertBaseThis(0);
    StopAll();
    FlushMsq();
    ReleasePpo(&_pglsqe);
    ReleasePpo(&_pclok);
}

#ifdef DEBUG
/***************************************************************************
    Assert the validity of the MSND.
***************************************************************************/
void MSND::AssertValid(uint32_t grf)
{
    MSND_PAR::AssertValid(fobjAllocated);
    AssertNilOrPo(_prca, 0);
    AssertIn(_sty, 0, styLim);
}

/***************************************************************************
    Mark memory used by the MSND
***************************************************************************/
void MSND::MarkMem(void)
{
    AssertThis(0);
    MSND_PAR::MarkMem();
    // Note: don't mark _prca, because _prca marks us, and would cause
    // an infinite recursive loop.
}

/***************************************************************************
    Assert the validity of the MSQ.
***************************************************************************/
void MSQ::AssertValid(uint32_t grf)
{
    MSQ_PAR::AssertValid(fobjAllocated);
    AssertPo(_pglsqe, 0);
    AssertPo(_pclok, 0);
}

/***************************************************************************
    Mark memory used by the MSND
***************************************************************************/
void MSQ::MarkMem(void)
{
    AssertThis(0);
    MSQ_PAR::MarkMem();
    MarkMemObj(_pglsqe);
    MarkMemObj(_pclok);
}

#endif // DEBUG
