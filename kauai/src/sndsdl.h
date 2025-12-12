/***************************************************************************
    Author: Ben Stone
    Project: Kauai

    Sound playback device using SDL_Mixer

***************************************************************************/
#ifndef SNDSDL_H
#define SNDSDL_H

#include <SDL_mixer.h>

// Custom SDL message used for notifications
#define SDL_USEREVENT_SOUND_FINISHED (SDL_USEREVENT + 1)

typedef class SDLSoundDevice *PSDLSoundDevice;

#define SDLSoundDevice_PAR SNDMQ
#define kclsSDLSoundDevice KLCONST4('s', 's', 'd', 'v')
class SDLSoundDevice : public SDLSoundDevice_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    SDLSoundDevice();

    // Initialise the sound device
    virtual bool _FInit();

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

  public:
    // Create a new instance of the SDL sound device
    static PSDLSoundDevice PsdlsdNew();

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