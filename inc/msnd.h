/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    msnd.h: Movie sound class

    Primary Authors: *****, *****
    Status:  Reviewed

    BASE ---> BACO ---> MSND
    BASE ---> CMH  ---> MSQ

    NOTE: when the MSQ stops sounds, it does it based on sound class (scl)
    and not sound queue (sqn).  This is slightly less efficient, because the
    SNDM must search all open sound queues for the given scl's when we stop
    sounds; however, the code is made much simpler, because the sqn is
    generated on the fly based on whether the sound is for an actor or
    background, the sty of the sound, and (in the case of actor sounds) the
    arid of the source of the sound.  If we had to enumerate all sounds
    based on that information, we'd wind up calling into the SNDM a minimum
    of three times, plus three times for each actor; not only is the
    enumeration on this side inefficient (the MSQ would have to call into the
    MVIE to enumerate all the known actors), but the number of calls to SNDM
    gets to be huge!  On top of all that, we'd probably wind up finding some
    bugs where a sound is still playing for an actor that's been deleted, and
    possibly fail to stop the sound properly (Murphy reigning strong in any
    software project).

***************************************************************************/
#ifndef MSND_H
#define MSND_H

// Sound types
enum
{
    styNil = 0,
    styUnused, // Retain.  Existing content depends on subsequent values
    stySfx,
    stySpeech,
    styMidi,
    styLim
};

// Sound-class-number constants
const int32_t sclNonLoop = 0;
const int32_t sclLoopWav = 1;
const int32_t sclLoopMidi = 2;

#define vlmNil (-1)

// Sound-queue-number constants
enum
{
    sqnActr = 0x10000000,
    sqnBkgd = 0x20000000,
    sqnLim
};
#define ksqnStyShift 16; // Shift for the sqnsty

// Sound Queue Delta times
// Any sound times less than ksqdtimLong will be clocked & stopped
const int32_t kdtimOffMsq = 0;
const int32_t kdtimLongMsq = klwMax;
const int32_t kdtim2Msq = ((kdtimSecond * 2) * 10) / 12; // adjustment -> 2 seconds
const int32_t kSndSamplesPerSec = 22050;
const int32_t kSndBitsPerSample = 8;
const int32_t kSndBlockAlign = 1;
const int32_t kSndChannels = 1;

/****************************************

    Movie Sound on file

****************************************/
struct MSNDF
{
    int16_t bo;
    int16_t osk;
    int32_t sty;        // sound type
    int32_t vlmDefault; // default volume
    int32_t fInvalid;   // Invalid flag
};
VERIFY_STRUCT_SIZE(MSNDF, 16);
const BOM kbomMsndf = 0x5FC00000;

const CHID kchidSnd = 0; // Movie Sound sound/music

// Function to stop all movie sounds.
inline void StopAllMovieSounds(void)
{
    vpsndm->StopAll(sqnNil, sclNonLoop);
    vpsndm->StopAll(sqnNil, sclLoopWav);
    vpsndm->StopAll(sqnNil, sclLoopMidi);
}

/****************************************

    The Movie Sound class

****************************************/
typedef class MSND *PMSND;
#define MSND_PAR BACO
#define kclsMSND KLCONST4('M', 'S', 'N', 'D')
class MSND : public MSND_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    // these are inherent to the msnd
    CTG _ctgSnd;       // CTG of the WAV or MIDI chunk
    CNO _cnoSnd;       // CNO of the WAV or MIDI chunk
    PRCA _prca;        // file that the WAV/MIDI lives in
    int32_t _sty;      // MIDI, speech, or sfx
    int32_t _vlm;      // Volume of the sound
    tribool _fNoSound; // Set if silent sound
    STN _stn;          // Sound name
    bool _fInvalid;    // Invalid flag

  protected:
    bool _FInit(PCFL pcfl, CTG ctg, CNO cno);

  public:
    static bool FReadMsnd(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);
    static bool FGetMsndInfo(PCFL pcfl, CTG ctg, CNO cno, bool *pfInvalid = pvNil, int32_t *psty = pvNil,
                             int32_t *pvlm = pvNil);
    static bool FCopyMidi(PFIL pfilSrc, PCFL pcflDest, CNO *pcno, PSTN pstn = pvNil);
    static bool FWriteMidi(PCFL pcflDest, PMIDS pmids, STN *pstnName, CNO *pcno);
    static bool FCopyWave(PFIL pfilSrc, PCFL pcflDest, int32_t sty, CNO *pcno, PSTN pstn = pvNil);
    static bool FWriteWave(PFIL pfilSrc, PCFL pcflDest, int32_t sty, STN *pstnName, CNO *pcno);
    ~MSND(void);

    static int32_t SqnActr(int32_t sty, int32_t objID);
    static int32_t SqnBkgd(int32_t sty, int32_t objID);
    int32_t Scl(bool fLoop)
    {
        return (fLoop ? ((_sty == styMidi) ? sclLoopMidi : sclLoopWav) : sclNonLoop);
    }
    int32_t SqnActr(int32_t objID)
    {
        AssertThis(0);
        return SqnActr(_sty, objID);
    }
    int32_t SqnBkgd(int32_t objID)
    {
        AssertThis(0);
        return SqnBkgd(_sty, objID);
    }

    bool FInvalidate(void);
    bool FValid(void)
    {
        AssertBaseThis(0);
        return FPure(!_fInvalid);
    }
    PSTN Pstn(void)
    {
        AssertThis(0);
        return &_stn;
    }
    int32_t Sty(void)
    {
        AssertThis(0);
        return _sty;
    }
    int32_t Vlm(void)
    {
        AssertThis(0);
        return _vlm;
    }
    int32_t Spr(int32_t tool); // Return Priority
    tribool FNoSound(void)
    {
        AssertThis(0);
        return _fNoSound;
    }

    void Play(int32_t objID, bool fLoop, bool fQueue, int32_t vlm, int32_t spr, bool fActr = fFalse,
              uint32_t dtsStart = 0);
};

/****************************************

    Movie Sound Queue  (MSQ)
    Sounds to be played at one time.
    These are of all types, queues &
    classes

****************************************/
typedef class MSQ *PMSQ;
#define MSQ_PAR CMH
#define kclsMSQ KLCONST3('M', 'S', 'Q')

const int32_t kcsqeGrow = 10; // quantum growth for sqe

// Movie sound queue entry
struct SQE
{
    int32_t objID;     // Unique identifier (actor id, eg)
    bool fLoop;        // Looping sound flag
    bool fQueue;       // Queued sound
    int32_t vlmMod;    // Volume modification
    int32_t spr;       // Priority
    bool fActr;        // Actor vs Scene (to generate unique class)
    PMSND pmsnd;       // PMSND
    uint32_t dtsStart; // How far into the sound to start playing
};

class MSQ : public MSQ_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(MSQ)

  protected:
    PGL _pglsqe;   // Sound queue entries
    int32_t _dtim; // Time sound allowed to play
    PCLOK _pclok;

  public:
    MSQ(int32_t hid) : MSQ_PAR(hid)
    {
    }
    ~MSQ(void);

    static PMSQ PmsqNew(void);

    bool FEnqueue(PMSND pmsnd, int32_t objID, bool fLoop, bool fQueue, int32_t vlm, int32_t spr, bool fActr = fFalse,
                  uint32_t dtsStart = 0, bool fLowPri = fFalse);
    void PlayMsq(void);  // Destroys queue as it plays
    void FlushMsq(void); // Without playing the sounds
    bool FCmdAlarm(PCMD pcmd);

    // Sound on/off & duration control
    void SndOff(void)
    {
        AssertThis(0);
        _dtim = kdtimOffMsq;
    }
    void SndOnShort(void)
    {
        AssertThis(0);
        _dtim = kdtim2Msq;
    }
    void SndOnLong(void)
    {
        AssertThis(0);
        _dtim = kdtimLongMsq;
    }
    void StopAll(void)
    {
        if (pvNil != _pclok)
            _pclok->Stop();

        StopAllMovieSounds();
    }
    bool FPlaying(bool fLoop)
    {
        AssertThis(0);
        return (fLoop ? (vpsndm->FPlayingAll(sqnNil, sclLoopMidi) || vpsndm->FPlayingAll(sqnNil, sclLoopWav))
                      : vpsndm->FPlayingAll(sqnNil, sclNonLoop));
    }

    // Save/Restore snd-on duration times
    int32_t DtimSnd(void)
    {
        AssertThis(0);
        return _dtim;
    }
    void SndOnDtim(int32_t dtim)
    {
        AssertThis(0);
        _dtim = dtim;
    }
};

#endif // MSND_H
