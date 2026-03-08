/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    MIDI stream interface: Windows base class

***************************************************************************/
#ifndef MIDISTREAMWIN_H
#define MIDISTREAMWIN_H

typedef HMIDIOUT HMS;

typedef class WMSB *PWMSB;
#define WMSB_PAR MISI
#define kclsWMSB KLCONST4('W', 'M', 'S', 'B')
class WMSB : public WMSB_PAR
{
    RTCLASS_DEC

  protected:
    HMS _hms;          // the midi stream handle
    PFNMIDI _pfnCall;  // call back function
    uintptr_t _luUser; // user data to send back

    // system volume level - to be saved and restored. The volume we set
    // is always relative to this
    tribool _tBogusDriver; // to indicate whether midiOutGetVolume really works
    DWORD _luVolSys;
    int32_t _vlmBase; // our current volume relative to _luVolSys.

    WMSB(PFNMIDI pfn, uintptr_t luUser);

    virtual bool _FOpen(void) = 0;
    virtual bool _FClose(void) = 0;

    void _Reset(void);
    void _GetSysVol(void);
    void _SetSysVol(uint32_t luVol);
    void _SetSysVlm(void);

  public:
    virtual void SetVlm(int32_t vlm);
    virtual int32_t VlmCur(void);

    virtual bool FActive(void);
    virtual bool FActivate(bool fActivate);

    virtual bool FQueueBuffer(void *pvData, int32_t cb, int32_t ibStart, int32_t cactPlay, uintptr_t luData) = 0;
    virtual void StopPlaying(void) = 0;
};

#endif //! MIDISTREAMWIN_H
