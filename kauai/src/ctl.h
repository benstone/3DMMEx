/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Standard controls (scroll bars, etc).

***************************************************************************/
#ifndef CTL_H
#define CTL_H

#ifdef WIN
typedef HWND HCTL;
#elif defined(MAC)
typedef ControlHandle HCTL;
#else
typedef KWND HCTL;
#endif

// general control
typedef class CTL *PCTL;
#define CTL_PAR GOB
#define kclsCTL KLCONST3('C', 'T', 'L')
class CTL : public CTL_PAR
{
    RTCLASS_DEC

  private:
    HCTL _hctl;

  protected:
    CTL(PGCB pgcb);
    ~CTL(void);

    virtual void _NewRc(void) override;
    HCTL _Hctl(void)
    {
        return _hctl;
    }
    bool _FSetHctl(HCTL hctl);

  public:
    static PCTL PctlFromHctl(HCTL hctl);

#ifdef MAC
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
#endif // MAC
};

// scroll bar
enum
{
    fscbNil = 0,
    fscbVert = 1,
    fscbHorz = 2,
    fscbStandardRc = 4,

    // These are for GetStandardRc and GetClientRc.  They indicate that
    // the controls should not hide the indicated edge (ie, the edge should
    // be just inside the parent's rectangle).
    fscbShowLeft = 16,
    fscbShowRight = 32,
    fscbShowTop = 64,
    fscbShowBottom = 128
};
#define kgrfscbShowHorz (fscbShowLeft | fscbShowRight)
#define kgrfscbShowVert (fscbShowTop | fscbShowBottom)
#define kgrfscbShowAll (kgrfscbShowHorz | kgrfscbShowVert)

// scroll action
enum
{
    scaNil,
    scaPageUp,
    scaPageDown,
    scaLineUp,
    scaLineDown,
    scaToVal,
};

typedef class SCB *PSCB;
#define SCB_PAR CTL
#define kclsSCB KLCONST3('S', 'C', 'B')
class SCB : public SCB_PAR
{
    RTCLASS_DEC

  private:
    int32_t _val;
    int32_t _valMin;
    int32_t _valMax;
    bool _fVert : 1;
#ifdef WIN
    bool _fSentEndScroll : 1;
#endif // WIN

  protected:
    SCB(PGCB pgcb) : CTL(pgcb)
    {
    }
    bool _FCreate(int32_t val, int32_t valMin, int32_t valMax, uint32_t grfscb);

#ifdef MAC
    virtual void _ActivateHwnd(bool fActive) override;
#endif // MAC

  public:
    static int32_t DxpNormal(void);
    static int32_t DypNormal(void);
    static void GetStandardRc(uint32_t grfscb, RC *prcAbs, RC *prcRel);
    static void GetClientRc(uint32_t grfscb, RC *prcAbs, RC *prcRel);
    static PSCB PscbNew(PGCB pgcb, uint32_t grfscb, int32_t val = 0, int32_t valMin = 0, int32_t valMax = 0);

    void SetVal(int32_t val, bool fRedraw = fTrue);
    void SetValMinMax(int32_t val, int32_t valMin, int32_t valMax, bool fRedraw = fTrue);

    int32_t Val(void)
    {
        return _val;
    }
    int32_t ValMin(void)
    {
        return _valMin;
    }
    int32_t ValMax(void)
    {
        return _valMax;
    }

#ifdef MAC
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
#endif // MAC
#ifdef WIN
    virtual void TrackScroll(int32_t sb, int32_t lwVal);
#endif // WIN
};

// size box
typedef class WSB *PWSB;
#define WSB_PAR CTL
#define kclsWSB KLCONST3('W', 'S', 'B')
class WSB : public WSB_PAR
{
    RTCLASS_DEC

  protected:
    WSB(PGCB pgcb) : CTL(pgcb)
    {
    }

#ifdef MAC
    virtual void _ActivateHwnd(bool fActive) override;
#endif // MAC

  public:
    static PWSB PwsbNew(PGOB pgob, uint32_t grfgob);

#ifdef MAC
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
#endif // MAC
};

#endif //! CTL_H
