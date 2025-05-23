/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    tdt.h: Three-D Text class

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

    BASE ---> BACO ---> TMPL ---> TDT  (Three-D Text)

***************************************************************************/
#ifndef TDT_H
#define TDT_H

// 3-D Text Shapes - the positions and orientations of the letters
enum
{
    tdtsNil = -1,
    tdtsNormal = 0,
    tdtsArchPositive,
    tdtsCircleY,
    tdtsLargeMiddle,
    tdtsArchNegative,
    tdtsArchZ,
    tdtsCircleZ,
    tdtsVertical,
    tdtsGrowRight,
    tdtsGrowLeft,
    tdtsLim
};

// 3-D Actions
enum
{
    tdaNil = -1,
    tdaRest = 0,
    tdaLetterRotX, // each letter rotates around its own X axis
    tdaLetterRotY,
    tdaLetterRotZ,
    tdaSwingX, // letters skew right, then left, then back to normal
    tdaSwingY,
    tdaSwingZ,
    tdaPulse,    // letters grow 10%, then shrink back to normal
    tdaWordRotX, // (rotate entire word around X axis)
    tdaWordRotY,
    tdaWordRotZ,
    tdaWave,    // a bump ripples through the letters
    tdaReveal,  // letters slowly grow from zero height
    tdaWalk,    // walk (word hops forward as if walking)
    tdaHop,     // letters hop up and down
    tdaStretch, // stretch in X
    tdaLim
};

/****************************************
    3-D Text class
****************************************/
typedef class TDT *PTDT;
#define TDT_PAR TMPL
#define kclsTDT KLCONST3('T', 'D', 'T')
class TDT : public TDT_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    static PGST _pgstAction; // Action names

    int32_t _tdts;       // TDT shape
    TAG _tagTdf;         // Tag to Three-D Font
    PMTRL _pmtrlDefault; // MTRL for TDT's default costume
    PACTN _pactnCache;   // Last-used action
    int32_t _tdaCache;   // Action in pactnCache

  protected:
    virtual bool _FInit(PCFL pcfl, CTG ctgTmpl, CNO cnoTmpl) override;
    bool _FInitLists(void);
    PGL _PglibactParBuild(void);
    PGL _PglibsetBuild(void);
    PGG _PggcmidBuild(void);
    PGL _Pglbmat34Build(int32_t tda);
    PGG _PggcelBuild(int32_t tda);
    virtual PACTN _PactnFetch(int32_t tda) override;
    PACTN _PactnBuild(int32_t tda);
    virtual PMODL _PmodlFetch(CHID chidModl) override;
    int32_t _CcelOfTda(int32_t tda);
    void _ApplyAction(BMAT34 *pbmat34, int32_t tda, int32_t ich, int32_t ccel, int32_t icel, BRS xrChar, BRS pdxrText);
    void _ApplyShape(BMAT34 *pbmat34, int32_t tdts, int32_t cch, int32_t ich, BRS xrChar, BRS dxrText, BRS yrChar,
                     BRS dyrMax, BRS dyrTotal);

  public:
    static bool FSetActionNames(PGST pgstAction);
#ifdef DEBUG
    static void MarkActionNames(void);
#endif

    static PTDT PtdtNew(PSTN pstn, int32_t tdts, PTAG ptagTdf);
    ~TDT(void);
    static PGL PgltagFetch(PCFL pcfl, CTG ctg, CNO cno, bool *pfError);
    PTDT PtdtDup(void);

    void GetInfo(PSTN pstn, int32_t *ptdts, PTAG ptagTdf);
    bool FChange(PSTN pstn, int32_t tdts = tdtsNil, PTAG ptagTdf = pvNil);
    bool FWrite(PCFL pcfl, CTG ctg, CNO *pcno);
    bool FAdjustBody(PBODY pbody);
    virtual bool FSetDefaultCost(PBODY pbody) override;
    virtual PCMTL PcmtlFetch(int32_t cmid) override;
    virtual bool FGetActnName(int32_t anid, PSTN pstn) override;
};

#endif // TDT_H
