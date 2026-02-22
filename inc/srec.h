/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    srec.h: Sound Recording class

    Primary Author: ****** (based on ***** original srec)
    Review Status: reviewed

    BASE ---> SREC

***************************************************************************/
#ifndef SREC_H
#define SREC_H

#ifdef HAS_AUDIOMAN
#include "audioman.h"
#endif // HAS_AUDIOMAN

#ifdef KAUAI_SDL
#include <miniaudio.h>
#endif // KAUAI_SDL

/****************************************
    RIFF Header helper class
****************************************/
#ifdef MAC
#define RIFF_TAG 'RIFF'
#define WAVE_TAG 'WAVE'
#define FMT__TAG 'fmt '
#define DATA_TAG 'data'
#define FACT_TAG 'fact'
#else
#define RIFF_TAG 'FFIR' // RIFF
#define WAVE_TAG 'EVAW' // WAVE
#define FMT__TAG ' tmf' // fmt_
#define DATA_TAG 'atad' // data
#define FACT_TAG 'tcaf' // fact
#endif

#ifdef KAUAI_WIN32

#pragma pack(push, _SOCPACK_)
#pragma pack(1)

class RIFF
{
  private:
    DWORD _dwRiffTag;
    DWORD _dwRiffLength;
    DWORD _dwWaveTag;
    DWORD _dwFmtTag;
    DWORD _dwFmtLength;
    WAVEFORMATEX _wfx;
    DWORD _dwDataTag;
    DWORD _dwDataLength;

  public:
    void Set(int32_t cchan, int32_t csampSec, int32_t cbSample, DWORD dwLength)
    {
        _dwRiffTag = RIFF_TAG;
        _dwRiffLength = sizeof(RIFF) + dwLength;
        _dwWaveTag = WAVE_TAG;
        _dwFmtTag = FMT__TAG;
        _dwFmtLength = sizeof(WAVEFORMATEX);
        _wfx.wFormatTag = WAVE_FORMAT_PCM;
        _wfx.nChannels = (uint16_t)cchan;
        _wfx.nSamplesPerSec = csampSec;
        _wfx.nAvgBytesPerSec = csampSec * cbSample * cchan;
        _wfx.nBlockAlign = (uint16_t)cchan * (uint16_t)cbSample;
        _wfx.wBitsPerSample = (uint16_t)LwMul(8, cbSample);
        _wfx.cbSize = 0;
        _dwDataTag = DATA_TAG;
        _dwDataLength = dwLength;
    }

    LPWAVEFORMATEX PwfxGet()
    {
        return &_wfx;
    };

    DWORD Cb()
    {
        return sizeof(RIFF) + _dwDataLength;
    };
};
#pragma pack(pop, _SOCPACK_)

#endif // KAUAI_WIN32

/****************************************
    The sound recording class
****************************************/
typedef class SREC *PSREC;
#define SREC_PAR BASE
#define kclsSREC KLCONST4('S', 'R', 'E', 'C')
class SREC : public SREC_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    int32_t _csampSec; // sampling rate (number of samples per second)
    int32_t _cchan;    // 1 = mono, 2 = stereo
    int32_t _cbSample; // bytes per sample (1 = 8 bit, 2 = 16 bit, etc)
    uint32_t _dtsMax;  // maximum length to record
    bool _fRecording;
    bool _fPlaying;
    bool _fHaveSound;   // have you recorded a sound yet?
    bool _fBufferAdded; // have added record buffer

#ifdef KAUAI_WIN32
    HWAVEIN _hwavein; // handle to wavein device
    WAVEHDR _wavehdr; // wave hdr for buffer

#if defined(HAS_AUDIOMAN)
    LPMIXER _pmixer;     // pointer to Audioman Mixer
    LPCHANNEL _pchannel; // pointer to Audioman Channel
    LPSOUND _psnd;       // psnd for current sound
#endif                   // HAS_AUDIOMAN
    RIFF *_priff;        // pointer to riff in memory

    bool _FOpenRecord();
    bool _FCloseRecord();
    static void _WaveInProc(HWAVEIN hwi, UINT uMsg, DWORD_PTR dwInstance, DWORD_PTR dwParam1, DWORD_PTR dwParam2);
#endif // KAUAI_WIN32

#ifdef KAUAI_SDL

    ma_format _format;

    bool _fInitDevice = fFalse;
    ma_device _device;

    // This buffer holds recorded PCM audio frames
    HQ _hqBuffer = hqNil;
    int32_t _ibBuffer = 0;

    ma_uint32 _cFrame;    // Number of frames recorded
    ma_uint32 _cFrameMac; // Maximum number of frames to record

    bool _fInitPlaybackBuffer = fFalse;
    ma_audio_buffer _playbackBuffer;

    bool _fInitPlaybackSound = fFalse;
    ma_sound _sound;

    // Called when new audio frames are available
    static void OnDataProc(ma_device *pDevice, void *pOutput, const void *pInput, ma_uint32 frameCount);

#endif // KAUAI_SDL

  protected:
    bool _FInit(int32_t csampSec, int32_t cchan, int32_t cbSample, uint32_t dtsMax);
    void _UpdateStatus(void);

  public:
    static PSREC PsrecNew(int32_t csampSec, int32_t cchan, int32_t cbSample, uint32_t dtsMax);
    ~SREC(void);

    bool FStart(void);
    bool FStop(void);
    bool FPlay(void);
    bool FRecording(void);
    bool FPlaying(void);
    bool FSave(PFNI pfni);
    bool FHaveSound(void)
    {
        return _fHaveSound;
    }
};

#endif // SREC_H
