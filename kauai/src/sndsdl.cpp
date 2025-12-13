/***************************************************************************
    Author: Ben Stone
    Project: Kauai
    Reviewed:

    Sound playback device using SDL_Mixer

***************************************************************************/
#include "frame.h"
ASSERTNAME

#include "sndsdl.h"

#define AssertDoMix(x) AssertDo(x >= 0, Mix_GetError());

// Maximum number of SDL channels that will be allocated
const SDLChannelId kSDLChannelIdMac = 32;
const SDLChannelId kSDLChannelIdInvalid = -1;

const int32_t klwFrequency = 44100;
const int32_t klwChunkSize = 1024;

// Channel ID reserved for MIDI playback
const SDLChannelId kSDLChannelIdMidi = 0;

// Number of milliseconds after playing a new sound that pause will be ignored.
// This is a hack to work around a difference in behaviour in AudioMan.
// When AudioMan plays a sound it will mix and write a chunk of the sound to the
// sound device immediately. SDL_Mixer does not do this.
// When a GOB is clicked and destroyed, the mouse sound is played and immediately stopped.
// So, if a sound is played and immediately stopped, we ignore pause/stop requests for a short
// time.
// TODO: Find a better solution for this.
const int32_t kdtsDebounce = 250; // milliseconds

typedef class SDLSound *PSDLSound;
#define SDLSound_PAR BACO
#define kclsSDLSound KLCONST4('s', 's', 'n', 'c')

// SDL Cached sound
class SDLSound : public SDLSound_PAR
{
    RTCLASS_DEC
    ASSERT
    NOCOPY(SDLSound)
  public:
    // Allocate a new SDL Sound from a file location
    static PSDLSound PsdlsoundNew(FLO *pflo, bool fPacked)
    {
        AssertPo(pflo, ffloReadable);
        PSDLSound psdlsound = pvNil;
        BLCK blck;
        HQ hqSound = hqNil;
        SDL_RWops *prwops = pvNil;

        if (pvNil == (psdlsound = NewObj SDLSound))
            return pvNil;

        // Decompress the sound if required
        if (fPacked)
        {
            blck.Set(pflo, fPacked);
            if (!blck.FUnpackData())
            {
                ReleasePpo(&psdlsound);
                return pvNil;
            }
        }
        else
        {
            blck.Set(pflo);
        }

        // Read the entire sound into memory
        if (!blck.FReadHq(&hqSound))
        {
            Bug("Could not read sound into memory");
            ReleasePpo(&psdlsound);
            return pvNil;
        }

        // Get the address of the sound data
        uint8_t *pbSound = (uint8_t *)PvLockHq(hqSound);
        Assert(pbSound != pvNil, "Could not lock HQ containing sound in memory");
        if (pbSound != pvNil)
        {
            // Load the chunk
            prwops = SDL_RWFromConstMem(pbSound, CbOfHq(hqSound));
            Assert(prwops != pvNil, "Could not create RWops from HQ");
            if (prwops != pvNil)
            {
                psdlsound->pchunk = Mix_LoadWAV_RW(prwops, 0);
                Assert(psdlsound->pchunk != pvNil, Mix_GetError());
                SDL_RWclose(prwops);
                prwops = pvNil;
            }
            UnlockHq(hqSound);
        }
        FreePhq(&hqSound);

        if (psdlsound->pchunk == pvNil)
        {
            Bug("Could not load sound");
            ReleasePpo(&psdlsound);
            return pvNil;
        }

        // Cleanup
        AssertPo(psdlsound, 0);
        return psdlsound;
    }
    int32_t CbMem(void)
    {
        return SIZEOF(SDLSound);
    }

    static bool FReadSDLSound(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb)
    {
        AssertPo(pcrf, 0);
        AssertPo(pblck, 0);
        AssertNilOrVarMem(ppbaco);
        AssertVarMem(pcb);
        FLO flo;
        bool fPacked;
        PSDLSound psdlsound = pvNil;

        *pcb = SIZEOF(SDLSound);
        if (pvNil == ppbaco)
            return fTrue;

        *ppbaco = pvNil;
        if (!pcrf->Pcfl()->FFindFlo(ctg, cno, &flo))
            return fFalse;

        fPacked = pcrf->Pcfl()->FPacked(ctg, cno);

        if (pvNil == (psdlsound = SDLSound::PsdlsoundNew(&flo, fPacked)))
            return fFalse;

        AssertNilOrPo(psdlsound, 0);
        *ppbaco = psdlsound;
        return pvNil != *ppbaco;
    }

    // Get the loaded SDL sound chunk
    Mix_Chunk *GetChunk()
    {
        AssertThis(0);
        return pchunk;
    }

  protected:
    SDLSound()
    {
    }
    virtual ~SDLSound()
    {
        if (pchunk != pvNil)
        {
            Mix_FreeChunk(pchunk);
            pchunk = pvNil;
        }
    }

    Mix_Chunk *pchunk = pvNil;
};

#ifdef DEBUG
void SDLSound::AssertValid(uint32_t grf)
{
    SDLSound_PAR::AssertValid(0);
    Assert(pchunk != pvNil, "Chunk should be set!");
}
#endif // DEBUG

// SDL Sound notifier
// This will receive notifications from SDL_Mixer when channels finish playing sounds.
#define SDLSoundNotifier_PAR CMH
#define kclsSDLSoundNotifier KLCONST4('s', 's', 'n', 'o')
class SDLSoundNotifier : public SDLSoundNotifier_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    NOCOPY(SDLSoundNotifier)
    CMD_MAP_DEC(SDLSoundNotifier)

  protected:
    PSDLSoundDevice _psdlsd = pvNil;

  public:
    SDLSoundNotifier(int32_t hid) : CMH(hid)
    {
    }
    void Set(PSDLSoundDevice psdlsd);
    virtual ~SDLSoundNotifier();

    bool FChannelFinished(PCMD pcmd);
};

// Notifications
BEGIN_CMD_MAP(SDLSoundNotifier, CMH)
ON_CID_ALL(cidSDLSoundChannelFinished, &SDLSoundNotifier::FChannelFinished, pvNil)
END_CMD_MAP_NIL()

// SDL Sound queue
typedef class SDLSoundQueue *PSDLSoundQueue;
#define SDLSoundQueue_PAR SNQUE
#define kclsSDLSoundQueue KLCONST4('s', 's', 'n', 'q')
class SDLSoundQueue : public SDLSoundQueue_PAR
{
    RTCLASS_DEC
    ASSERT
    NOCOPY(SDLSoundQueue)
    MARKMEM
  protected:
    // Lock for accessing member variables
    MUTX _mutx;

    PSDLSoundDevice _psdlsd = pvNil;

    // SDL channel index
    SDLChannelId _ichannel;

    // Time when the last sound started playing
    int32_t _tsLastPlay;

    // Enter critical section protecting member variables
    virtual void _Enter(void) override;

    // Leave critical section protecting member variables
    virtual void _Leave(void) override;

    // Initialize
    virtual bool _FInit(PSDLSoundDevice psdlsd, SDLChannelId _ichannel);

    // Load a sound
    virtual PBACO _PbacoFetch(PRCA prca, CTG ctg, CNO cno) override;

    // Called when an item is added to or deleted from the queue
    virtual void _Queue(int32_t isndinMin) override;

    // Called when one or more items in the queue are paused
    virtual void _PauseQueue(int32_t isndinMin) override;

    // Called when one or more items in the queue are resumed
    virtual void _ResumeQueue(int32_t isndinMin) override;

    // HACK: Workaround for cut-off mouse sounds
    void Debounce();

  public:
    static PSDLSoundQueue PSDLSoundQueueNew(PSDLSoundDevice psdlsd, SDLChannelId ichannel);
    ~SDLSoundQueue(void);

    SDLChannelId ChannelId()
    {
        return _ichannel;
    }

    // Called when SDL_Mixer finishes playing the sound
    void OnFinished();
};

RTCLASS(SDLSound);
RTCLASS(SDLSoundQueue);
RTCLASS(SDLSoundNotifier);

// Notifier
SDLSoundNotifier::~SDLSoundNotifier()
{
    ReleasePpo(&_psdlsd);
}

void SDLSoundNotifier::Set(PSDLSoundDevice psdlsd)
{
    _psdlsd = psdlsd;
    _psdlsd->AddRef();
}

bool SDLSoundNotifier::FChannelFinished(PCMD pcmd)
{
    _psdlsd->NotifyChannelFinished(pcmd->rglw[0]);
    return fTrue;
}

#ifdef DEBUG
void SDLSoundNotifier::AssertValid(uint32_t grf)
{
    SDLSoundNotifier_PAR::AssertValid(0);
    _psdlsd->AssertValid(0);
}

void SDLSoundNotifier::MarkMem()
{
    AssertThis(0);
    SDLSoundNotifier_PAR::MarkMem();
    MarkMemObj(_psdlsd);
}
#endif // DEBUG

// Sound queue
void SDLSoundQueue::_Enter(void)
{
    _mutx.Enter();
}

void SDLSoundQueue::_Leave(void)
{
    _mutx.Leave();
}

bool SDLSoundQueue::_FInit(PSDLSoundDevice psdlsd, SDLChannelId ichannel)
{
    if (!SDLSoundQueue_PAR::_FInit())
        return fFalse;

    psdlsd->AddRef();
    _psdlsd = psdlsd;

    _ichannel = ichannel;

    return fTrue;
}

PBACO SDLSoundQueue::_PbacoFetch(PRCA prca, CTG ctg, CNO cno)
{
    AssertThis(0);
    AssertPo(prca, 0);

    return prca->PbacoFetch(ctg, cno, &SDLSound::FReadSDLSound);
}

void SDLSoundQueue::_Queue(int32_t isndinMin)
{
    AssertThis(0);
    SNDIN sndin = {0};
    int32_t isndin;

    PSDLSound psdlsound = pvNil;

    _Enter();

    if (_isndinCur == isndinMin && pvNil != _pglsndin)
    {
        for (; _isndinCur < _pglsndin->IvMac(); _isndinCur++)
        {
            _pglsndin->Get(_isndinCur, &sndin);
            if (0 <= sndin.cactPause)
                break;
        }

        if (_isndinCur < _pglsndin->IvMac() && 0 == sndin.cactPause)
        {
            psdlsound = (PSDLSound)sndin.pbaco;
            AssertPo(psdlsound, 0);
            Assert(psdlsound->FIs(kclsSDLSound), "Cached sound is wrong type");

            // Set the volume
            int vlmsdl = LuVolScale(MIX_MAX_VOLUME, sndin.vlm);
            Mix_Volume(_ichannel, vlmsdl);

            // TODO: If there is a starting offset, apply it (not sure if this is used?)
            Assert(sndin.dtsStart == 0, "Starting offset not supported yet");

            // PlayChannel expects the number of times to repeat, not the number of times to play
            int cactLoop = sndin.cactPlay - 1;
            AssertDoMix(Mix_PlayChannel(_ichannel, psdlsound->GetChunk(), cactLoop));
            _tsLastPlay = TsCurrentSystem();
        }
        else if (sndin.cactPause < 0)
        {
            Debounce();
            Mix_HaltChannel(_ichannel);
        }
    }

    _Leave();
}

void SDLSoundQueue::_PauseQueue(int32_t isndinMin)
{
    AssertThis(0);
    _Enter();

    Debounce();
    Mix_Pause(_ichannel);

    _Leave();
}

void SDLSoundQueue::_ResumeQueue(int32_t isndinMin)
{
    AssertThis(0);
    _Enter();

    Mix_Resume(_ichannel);

    _Leave();
}

PSDLSoundQueue SDLSoundQueue::PSDLSoundQueueNew(PSDLSoundDevice psdlsd, SDLChannelId ichannel)
{
    PSDLSoundQueue pqueue = pvNil;

    pqueue = NewObj SDLSoundQueue;
    if (pqueue == pvNil)
    {
        Bug("Could not allocate SDL sound queue");
        return pvNil;
    }

    if (!pqueue->_FInit(psdlsd, ichannel))
    {
        Bug("Could not initialize SDL sound queue");
        ReleasePpo(&pqueue);
        return pvNil;
    }

    return pqueue;
}

SDLSoundQueue::~SDLSoundQueue(void)
{
    ReleasePpo(&_psdlsd);
}

void SDLSoundQueue::OnFinished()
{
    AssertThis(0);
    SNDIN sndin;

    _Enter();

    if (pvNil != _pglsndin && _pglsndin->IvMac() > _isndinCur)
    {
        _pglsndin->Get(_isndinCur, &sndin);
        if (--sndin.cactPlay == 0)
        {
            _isndinCur++;
            _Queue(_isndinCur);
        }
        else
        {
            // Play the sound again
            // TODO: do we need to restart the sound?
            _pglsndin->Put(_isndinCur, &sndin);
        }
    }

    _Leave();
}

void SDLSoundQueue::Debounce()
{
    int32_t dtsWait = kdtsDebounce - (TsCurrentSystem() - _tsLastPlay);
    if (dtsWait > 0)
    {
        SDL_Delay(dtsWait);
    }
}

#ifdef DEBUG
void SDLSoundQueue::AssertValid(uint32_t grf)
{
    SDLSoundQueue_PAR::AssertValid(0);
    _psdlsd->AssertValid(0);
}

void SDLSoundQueue::MarkMem()
{
    AssertThis(0);
    SDLSoundQueue_PAR::MarkMem();
    MarkMemObj(_psdlsd);
}
#endif // DEBUG

// Sound device

RTCLASS(SDLSoundDevice)

SDLSoundDevice::SDLSoundDevice()
{
}

PSNQUE SDLSoundDevice::_PsnqueNew(void)
{
    AssertThis(0);
    PSDLSoundQueue pqueue = pvNil;
    SDLChannelId ichannelFree = 0;

    // Go through all of the allocated sound queues to find an unused channel ID
    bool rgfAllocated[kSDLChannelIdMac];
    ClearPb(rgfAllocated, SIZEOF(rgfAllocated));

    // Reserve channel for MIDI playback
    rgfAllocated[kSDLChannelIdMidi] = fTrue;

    for (int32_t iqueue = 0; iqueue < _pglsnqd->IvMac(); iqueue++)
    {
        SNQD snqd;
        _pglsnqd->Get(iqueue, &snqd);

        PSDLSoundQueue pqueuethis = (PSDLSoundQueue)snqd.psnque;
        AssertPo(pqueuethis, 0);
        Assert(pqueuethis->FIs(kclsSDLSoundQueue), "This list should only have SDL sound queues!!");

        SDLChannelId ichannel = pqueuethis->ChannelId();

        if (ichannel >= 0 && ichannel < CvFromRgv(rgfAllocated))
        {
            Assert(!rgfAllocated[ichannel], "Mixer channel used by multiple sound queues");
            rgfAllocated[ichannel] = fTrue;
        }
        else
        {
            Bug("Too many channels allocated");
            break;
        }
    }

    ichannelFree = kSDLChannelIdInvalid;
    for (int32_t ichannel = 0; ichannel < CvFromRgv(rgfAllocated); ichannel++)
    {
        if (!rgfAllocated[ichannel])
        {
            ichannelFree = ichannel;
            break;
        }
    }

    if (ichannelFree == kSDLChannelIdInvalid)
    {
        return pvNil;
    }

    if (pvNil == (pqueue = SDLSoundQueue::PSDLSoundQueueNew(this, ichannelFree)))
        return pvNil;

    return pqueue;
}

void SDLSoundDevice::_Suspend(bool fSuspend)
{
    AssertThis(0);

    if (fSuspend)
    {
        Mix_Pause(-1);
    }
    else
    {
        Mix_Resume(-1);
    }
}

void SDLSoundDevice::NotifyChannelFinished(int channel)
{
    AssertThis(0);

    // Find the sound queue associated with this channel
    for (int32_t isnqd = 0; isnqd < _pglsnqd->IvMac(); isnqd++)
    {
        SNQD snqd = {0};
        _pglsnqd->Get(isnqd, &snqd);

        PSDLSoundQueue psndque = (PSDLSoundQueue)snqd.psnque;
        AssertPo(psndque, 0);
        Assert(psndque->FIs(kclsSDLSoundQueue), "unexpected type");

        if (channel == psndque->ChannelId())
        {
            psndque->OnFinished();
            break;
        }
    }
}

void SDLSoundDevice::OnChannelFinished(int channel)
{
    CMD cmd;
    ClearPb(&cmd, SIZEOF(cmd));

    // NOTE: This callback runs on an SDL_Mixer thread.
    // Calling methods on sound queues may cause deadlocks.
    // So, we will send a Kauai command indicating that the sound finished playing.
    // This will be executed on the main thread by the SDLSoundNotifier object,
    // which will call NotifyChannelFinished.

    cmd.cid = cidSDLSoundChannelFinished;
    cmd.rglw[0] = channel;
    SDLEnqueueCmd(&cmd);
}

PSDLSoundDevice SDLSoundDevice::PsdlsdNew(PCEX pcex)
{
    AssertPo(pcex, 0);

    PSDLSoundDevice psdlsd;

    if (pvNil == (psdlsd = NewObj SDLSoundDevice))
        return pvNil;

    if (!psdlsd->_FInit(pcex))
        ReleasePpo(&psdlsd);

    AssertNilOrPo(psdlsd, 0);
    return psdlsd;
}

bool SDLSoundDevice::_FInit(PCEX pcex)
{
    AssertBaseThis(0);
    AssertPo(pcex, 0);
    int ret;

    // Initialise parent
    if (!SDLSoundDevice_PAR::_FInit())
        return fFalse;

    // Allocate a sound notifier
    int32_t hidNotifier = CMH::HidUnique();
    _psdlsn = NewObj SDLSoundNotifier(hidNotifier);
    if (_psdlsn == pvNil)
        return fFalse;

    _psdlsn->Set(this);
    AssertDo(pcex->FAddCmh(_psdlsn, 0, kgrfcmmAll), "Could not register for SDL sound notifications");

    // Initialise SDL mixer
    // TODO: constants
    AssertDoMix(ret = Mix_OpenAudio(klwFrequency, MIX_DEFAULT_FORMAT, 2, klwChunkSize));
    if (ret < 0)
        return fFalse;

    _fMixerOpen = fTrue;

    // Create all of the channels up-front
    ret = Mix_AllocateChannels(kSDLChannelIdMac);
    Assert(ret == kSDLChannelIdMac, "Could not open all of the requested channels");

    Mix_ChannelFinished(OnChannelFinished);

    SetVlm(kvlmFull);

    AssertThis(0);
    return fTrue;
}

SDLSoundDevice::~SDLSoundDevice()
{
    if (_fMixerOpen)
    {
        Mix_CloseAudio();
        _fMixerOpen = fFalse;
    }
}

void SDLSoundDevice::SetVlm(int32_t vlm)
{
    AssertThis(0);

    if (_vlm != vlm)
    {
        _vlm = vlm;
        int vlmsdl = LuVolScale(MIX_MAX_VOLUME, vlm);
        (void)Mix_MasterVolume(vlmsdl);
    }
}

int32_t SDLSoundDevice::VlmCur(void)
{
    AssertThis(0);
    return _vlm;
}

#ifdef DEBUG
void SDLSoundDevice::AssertValid(uint32_t grf)
{
    SDLSoundDevice_PAR::AssertValid(0);
}

void SDLSoundDevice::MarkMem()
{
    SDLSoundDevice_PAR::MarkMem();
    MarkMemObj(_psdlsn);
}
#endif // DEBUG

bool FValidSoundFile(PFNI pfniSoundFile)
{
    AssertPo(pfniSoundFile, 0);

    bool fRet = fFalse;
    STN stnFilePath;
    Mix_Chunk *pchunk = pvNil;

    pfniSoundFile->GetStnPath(&stnFilePath);

    pchunk = Mix_LoadWAV(stnFilePath.Psz());
    if (pchunk != pvNil)
    {
        fRet = fTrue;
        Mix_FreeChunk(pchunk);
        pchunk = pvNil;
    }
    else
    {
        Bug(Mix_GetError());
    }

    return fRet;
}
