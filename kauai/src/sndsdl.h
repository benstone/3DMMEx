/***************************************************************************
    Author: Ben Stone
    Project: Kauai

    Sound playback device using SDL_Mixer

***************************************************************************/
#ifndef SNDSDL_H
#define SNDSDL_H

#include <SDL_mixer.h>

// Kauai command ID used to indicate that a sound finished playing
#define cidSDLSoundChannelFinished 110001

typedef int SDLChannelId;

// Channel ID reserved for MIDI playback
extern const SDLChannelId kSDLChannelIdMidi;

typedef class SDLSoundDevice *PSDLSoundDevice;
typedef class SDLSoundNotifier *PSDLSoundNotifier;

#define SDLSoundDevice_PAR SNDMQ
#define kclsSDLSoundDevice KLCONST4('s', 's', 'd', 'v')
class SDLSoundDevice : public SDLSoundDevice_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    SDLSoundDevice();

    // Initialise the sound device
    virtual bool _FInit(PCEX pcex);

    // Return a new sound queue
    virtual PSNQUE _PsnqueNew(void) override;

    virtual void _Suspend(bool fSuspend) override;

    // SDL Mixer callback
    static void OnChannelFinished(int channel);

    // Volume
    int32_t _vlm = 0;

    bool _fMixerOpen = fFalse;

    // Number of allocated channels
    int32_t _cchannel = 0;

    PSDLSoundNotifier _psdlsn = pvNil;

  public:
    // Create a new instance of the SDL sound device
    static PSDLSoundDevice PsdlsdNew(PCEX pcex);

    virtual ~SDLSoundDevice();

    // Set volume
    virtual void SetVlm(int32_t vlm) override;

    // Get volume
    virtual int32_t VlmCur(void) override;

    // Called from event loop when a channel finishes playing
    void NotifyChannelFinished(int channel);
};

// Return true if this sound can be loaded by SDL_Mixer
bool FValidSoundFile(PFNI pfniSoundFile);

#endif // SNDSDL_H