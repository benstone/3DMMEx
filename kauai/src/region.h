/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************
    Author: ShonK
    Project: Kauai
    Reviewed:
    Copyright (c) Microsoft Corporation

    Region stuff.

***************************************************************************/
#ifndef REGION_H
#define REGION_H

typedef class REGSC *PREGSC;

/***************************************************************************
    The region class.
***************************************************************************/
typedef class REGN *PREGN;
#define REGN_PAR BASE
#define kclsREGN KLCONST4('R', 'E', 'G', 'N')
class REGN : public REGN_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    friend class REGSC;

    // The _pglxp contains a bunch of rows.  Each row consists of:
    // dyp, xp0, xp1, ..., klwMax.
    // The dyp is the height of the strip in pixels, the xp's are boundary points
    // The xp's are relative to _rc.xpLeft + _dxp. _pglxp is nil iff the region
    // is strictly rectangular.
    RC _rc;       // bounding rectangle
    int32_t _dxp; // additional offset for xp values
    PGL _pglxp;   // region data - see above
    PT _dptRgn;   // offset of _hrgn relative to this region

#ifdef KAUAI_WIN32
    HRGN _hrgn; // for HrgnEnsure
#endif

    REGN(void)
    {
    }

    bool _FUnionCore(RC *prc, PREGSC pregsc1, PREGSC pregsc2);
    bool _FIntersectCore(RC *prc, PREGSC pregsc1, PREGSC pregsc2);
    bool _FDiffCore(RC *prc, PREGSC pregsc1, PREGSC pregsc2);

  public:
    static PREGN PregnNew(RC *prc = pvNil);
    ~REGN(void);

    void SetRc(RC *prc = pvNil);
    void Offset(int32_t xp, int32_t yp);
    bool FEmpty(RC *prc = pvNil);
    bool FIsRc(RC *prc = pvNil);
    void Scale(int32_t lwNumX, int32_t lwDenX, int32_t lwNumY, int32_t lwDenY);

    bool FUnion(PREGN pregn1, PREGN pregn2 = pvNil);
    bool FUnionRc(RC *prc, PREGN pregn2 = pvNil);
    bool FIntersect(PREGN pregn1, PREGN pregn2 = pvNil);
    bool FIntersectRc(RC *prc, PREGN pregn = pvNil);
    bool FDiff(PREGN pregn1, PREGN pregn2 = pvNil);
    bool FDiffRc(RC *prc, PREGN pregn = pvNil);
    bool FDiffFromRc(RC *prc, PREGN pregn = pvNil);

#ifdef KAUAI_WIN32
    HRGN HrgnCreate(void);
    HRGN HrgnEnsure(void);
#endif // KAUAI_WIN32
};

/***************************************************************************
    Region scanner class.
***************************************************************************/
#define REGSC_PAR BASE
#define kclsREGSC KLCONST4('r', 'g', 's', 'c')
class REGSC : public REGSC_PAR
{
    RTCLASS_DEC

  protected:
    PGL _pglxpSrc;       // the list of points
    int32_t *_pxpLimSrc; // the end of the list
    int32_t *_pxpLimCur; // the end of the current row

    int32_t _xpMinRow;   // the first xp value of the active part of the current row
    int32_t *_pxpMinRow; // the beginning of the active part of the currrent row
    int32_t *_pxpLimRow; // the end of the active part of the current row
    int32_t *_pxp;       // the current postion in the current row

    int32_t _dxp;     // this gets added to all source xp values
    int32_t _xpRight; // the right edge of the active area - left edge is 0

    // current state
    bool _fOn;       // whether the current xp is a transition to on or off
    int32_t _xp;     // the current xp
    int32_t _dyp;    // the remaining height that this scan is effective for
    int32_t _dypTot; // the remaining total height of the active area

    // When scanning rectangles, _pglxpSrc will be nil and _pxpSrc et al will
    // point into this.
    int32_t _rgxpRect[4];

    void _InitCore(PGL pglxp, RC *prc, RC *prcRel);
    void _ScanNextCore(void);

  public:
    REGSC(void);
    ~REGSC(void);
    void Free(void);

    void Init(PREGN pregn, RC *prcRel);
    void InitRc(RC *prc, RC *prcRel);
    void ScanNext(int32_t dyp)
    {
        _dypTot -= dyp;
        if ((_dyp -= dyp) <= 0)
            _ScanNextCore();
        _pxp = _pxpMinRow;
        _xp = _xpMinRow;
        _fOn = fTrue;
    }
    int32_t XpFetch(void)
    {
        if (_pxp < _pxpLimRow - 1)
        {
            _xp = _dxp + *_pxp++;
            _fOn = !_fOn;
        }
        else if (_pxp < _pxpLimRow)
        {
            AssertH(_fOn);
            _xp = LwMin(_xpRight, _dxp + *_pxp++);
            _fOn = !_fOn;
        }
        else
        {
            _xp = klwMax;
            _fOn = fTrue;
        }
        return _xp;
    }

    bool FOn(void)
    {
        return _fOn;
    }
    int32_t XpCur(void)
    {
        return _xp;
    }
    int32_t DypCur(void)
    {
        return _dyp;
    }
    int32_t CxpCur(void)
    {
        return _pxpLimRow - _pxpMinRow + 1;
    }
};

#endif //! REGION_H
