/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK, Mark Cave-Ayland
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    MIDI stream interface: FluidSynth

***************************************************************************/
#ifndef MIDISTREAMFLUIDSYNTH_H
#define MIDISTREAMFLUIDSYNTH_H

#include <fluidsynth.h>
#include "sndma.h"

/***************************************************************************
    FluidSynth midi stream class.
***************************************************************************/
typedef class FMS *PFMS;
#define FMS_PAR MISI
#define kclsFMS KLCONST3('F', 'M', 'S')
class FMS : public FMS_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    struct MSB
    {
        void *pvData;
        int32_t cb;
        int32_t ibStart;
        int32_t cactPlay;

        uintptr_t luData;
    };

    PFNMIDI _pfnCall;         // call back function
    uintptr_t _luUser;        // user data to send back
    std::atomic<bool> _fOpen; // device is open

    MUTX _mutx;

    Signal _hevt;
    std::thread _hth;
    std::thread _hthr;

    fluid_settings_t *_flset;
    fluid_synth_t *_flsynth;
    int _flframecount;

    PMiniaudioStream _pastream;

    int32_t _vlmBase; // our current volume

    std::atomic<bool> _fChanged; // the event has been signalled
    std::atomic<bool> _fStop;    // tells the aux thread to stop all buffers
    std::atomic<bool> _fDone;    // tells the aux thread to return

    int32_t _imsbCur;
    PGL _pglmsb;
    PMEV _pmev;
    PMEV _pmevLim;
    uint32_t _tsCur;

    FMS(PFNMIDI pfn, uintptr_t luUser);
    bool _FInit(void);

    virtual bool _FOpen(void);
    virtual bool _FClose(void);

    void _Reset(void);

    uint32_t _LuThread(void);
    uint32_t _LuRenderThread(void);

    void _ReleaseBuffers(void);

  public:
    static PFMS PfmsNew(PFNMIDI pfn, uintptr_t luUser);
    ~FMS(void);

    virtual void SetVlm(int32_t vlm);
    virtual int32_t VlmCur(void);

    virtual bool FActive(void);
    virtual bool FActivate(bool fActivate);

    virtual bool FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData) override;
    virtual void StopPlaying(void) override;
};

#endif //! MIDISTREAMFLUIDSYNTH_H
