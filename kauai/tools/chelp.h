/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    Main include file for the help authoring tool.

***************************************************************************/
#ifndef CHELP_H
#define CHELP_H

#include "kidframe.h"
#include "chelpexp.h"
#include "chelpres.h"

extern PSTRG vpstrg;
extern SC_LID vsclid;
extern PSPLC vpsplc;

enum
{
    khidLigButton = khidLimFrame,
    khidLigPicture,
};

// creator type for the help editor
#define kctgChelp KLCONST4('C', 'H', 'L', 'P')

typedef class LID *PLID;
typedef class LIG *PLIG;
typedef class HETD *PHETD;

/***************************************************************************
    App class
***************************************************************************/
#define APP_PAR APPB
#define kclsAPP KLCONST3('A', 'P', 'P')
class APP : public APP_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(APP)

  protected:
    PCRM _pcrm;
    PLID _plidPicture;
    PLID _plidButton;

    virtual bool _FInit(uint32_t grfapp, uint32_t grfgob, int32_t ginDef) override;
    virtual void _FastUpdate(PGOB pgob, PREGN pregnClip, uint32_t grfapp = fappNil, PGPT pgpt = pvNil) override;

  public:
    virtual void GetStnAppName(PSTN pstn) override;
    virtual void UpdateHwnd(KWND hwnd, RC *prc, uint32_t grfapp = fappNil) override;

    virtual bool FCmdOpen(PCMD pcmd);
    virtual bool FCmdLoadResFile(PCMD pcmd);
    virtual bool FCmdChooseLanguage(PCMD pcmd);
    virtual bool FEnableChooseLanguage(PCMD pcmd, uint32_t *pgrfeds);

    PLIG PligNew(bool fButton, PGCB pgcb, PTXHD ptxhd);
    bool FLoadResFile(PFNI pfni);
    bool FOpenDocFile(PFNI pfni, int32_t cid = cidOpen);
};
extern APP vapp;

/***************************************************************************
    List document
***************************************************************************/
#define LID_PAR DOCB
#define kclsLID KLCONST3('L', 'I', 'D')
class LID : public LID_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    struct CACH
    {
        PCRF pcrf;
        CNO cno;
        CNO cnoMbmp;
    };

    PCRM _pcrm;   // where to look for the chunks
    CTG _ctg;     // what ctg to look for
    CHID _chid;   // what chid value the MBMP should be at (if _ctg is not MBMP)
    PGL _pglcach; // list of the chunks that we found

    LID(void);
    ~LID(void);

    bool _FInit(PCRM pcrm, CTG ctg, CHID chid);

  public:
    static PLID PlidNew(PCRM pcrm, CTG ctg, CHID chid = 0);

    bool FRefresh(void);
    int32_t Ccki(void);
    void GetCki(int32_t icki, CKI *pcki, PCRF *ppcrf = pvNil);
    PMBMP PmbmpGet(int32_t icki);
};

/***************************************************************************
    List display gob
***************************************************************************/
const int32_t kdxpCellLig = kdzpInch * 2;
const int32_t kdypCellLig = kdzpInch;

typedef class LIG *PLIG;
#define LIG_PAR DDG
#define kclsLIG KLCONST3('L', 'I', 'G')
class LIG : public LIG_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(LIG)

  protected:
    PTXHD _ptxhd;     // the document to put the chunk in
    PSCB _pscb;       // our scroll bar
    int32_t _dypCell; // how tall are our cells

    LIG(PLID plid, GCB *pgcb);
    bool _FInit(PTXHD ptxhd, int32_t dypCell);

  public:
    static PLIG PligNew(PLID plid, GCB *pgcb, PTXHD ptxhd, int32_t dypCell = kdypCellLig);

    PLID Plid(void);
    void Refresh(void);
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdScroll(PCMD pcmd) override;
};

/***************************************************************************
    Color chooser GOB.
***************************************************************************/
const int32_t kcacrCcg = 8;
const int32_t kdxpCcg = 78;
const int32_t kdxpFrameCcg = 2;

typedef class CCG *PCCG;
#define CCG_PAR GOB
#define kclsCCG KLCONST3('C', 'C', 'G')
class CCG : public CCG_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    PTXHD _ptxhd;     // the document to put the color in
    int32_t _cacrRow; // how many colors to put on a row
    bool _fForeColor; // whether this sets the foreground or background color

    bool _FGetAcrFromPt(int32_t xp, int32_t yp, ACR *pacr, RC *prc = pvNil, int32_t *piscr = pvNil);

  public:
    CCG(GCB *pgcb, PTXHD ptxhd, bool fForeColor, int32_t cacrRow = kcacrCcg);

    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdMouseMove(PCMD_MOUSE pcmd) override;

    virtual bool FEnsureToolTip(PGOB *ppgobCurTip, int32_t xpMouse, int32_t ypMouse) override;
};

/***************************************************************************
    Color chooser tool tip.
***************************************************************************/
typedef class CCGT *PCCGT;
#define CCGT_PAR GOB
#define kclsCCGT KLCONST4('C', 'C', 'G', 'T')
class CCGT : public CCGT_PAR
{
    RTCLASS_DEC

  protected:
    ACR _acr;
    STN _stn;

  public:
    CCGT(PGCB pgcb, ACR acr = kacrBlack, PSTN pstn = pvNil);

    void SetAcr(ACR acr, PSTN pstn = pvNil);
    ACR AcrCur(void)
    {
        return _acr;
    }

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
};

/***************************************************************************
    Help editor doc - consists of a CFL containing (possibly) multiple
    topics.
***************************************************************************/
typedef class HEDO *PHEDO;
#define HEDO_PAR DOCB
#define kclsHEDO KLCONST4('H', 'E', 'D', 'O')
class HEDO : public HEDO_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    PCFL _pcfl; // the chunky file
    PRCA _prca; // the resources

    HEDO(void);
    ~HEDO(void);

  public:
    static PHEDO PhedoNew(FNI *pfni, PRCA prca);

    PCFL Pcfl(void)
    {
        return _pcfl;
    }
    PRCA Prca(void)
    {
        return _prca;
    }
    virtual PDDG PddgNew(PGCB pgcb) override;
    virtual bool FGetFni(FNI *pfni) override;
    virtual bool FGetFniSave(FNI *pfni) override;
    virtual bool FSaveToFni(FNI *pfni, bool fSetFni) override;

    virtual void InvalAllDdg(CNO cno);
    virtual bool FExportText(void);
    virtual void DoFindNext(PHETD phetd, CNO cno, bool fAdvance = fTrue);

    virtual PHETD PhetdOpenNext(PHETD phetd);
    virtual PHETD PhetdOpenPrev(PHETD phetd);
};

/***************************************************************************
    TSEL: used to track a selection in a chunky file doc
***************************************************************************/
#define TSEL_PAR BASE
#define kclsTSEL KLCONST4('T', 'S', 'E', 'L')
class TSEL : public TSEL_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    PCFL _pcfl;
    int32_t _icki;
    CNO _cno;

    void _SetNil(void);

  public:
    TSEL(PCFL pcfl);

    void Adjust(void);

    int32_t Icki(void)
    {
        return _icki;
    }
    CNO Cno(void)
    {
        return _cno;
    }

    bool FSetIcki(int32_t icki);
    bool FSetCno(CNO cno);
};

/***************************************************************************
    Help editor document display GOB - displays a HEDO.
***************************************************************************/
typedef class HEDG *PHEDG;
#define HEDG_PAR DDG
#define kclsHEDG KLCONST4('H', 'E', 'D', 'G')
class HEDG : public HEDG_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(HEDG)
    ASSERT

  protected:
    int32_t _onn;       // fixed width font to use
    int32_t _dypHeader; // height of the header
    int32_t _dypLine;   // height of one line
    int32_t _dxpChar;   // width of a character
    int32_t _dypBorder; // height of border (included in _dypLine)
    PCFL _pcfl;         // the chunky file
    TSEL _tsel;         // the selection

    HEDG(PHEDO phedo, PCFL pcfl, PGCB pgcb);
    virtual void _Scroll(int32_t scaHorz, int32_t scaVert, int32_t scvHorz = 0, int32_t scvVert = 0) override;
    virtual void _ScrollDxpDyp(int32_t dxp, int32_t dyp) override;

    int32_t _YpFromIcki(int32_t icki)
    {
        return LwMul(icki - _scvVert, _dypLine) + _dypHeader;
    }
    int32_t _XpFromIch(int32_t ich)
    {
        return LwMul(ich - _scvHorz + 1, _dxpChar);
    }
    int32_t _IckiFromYp(int32_t yp);
    void _GetContent(RC *prc);

    void _DrawSel(PGNV pgnv);
    void _SetSel(int32_t icki, CNO cno = cnoNil);
    void _ShowSel(void);
    void _EditTopic(CNO cno);

    virtual void _Activate(bool fActive) override;
    virtual int32_t _ScvMax(bool fVert) override;

    // clipboard support
    virtual bool _FCopySel(PDOCB *ppdocb = pvNil) override;
    virtual void _ClearSel(void) override;
    virtual bool _FPaste(PCLIP pclip, bool fDoIt, int32_t cid) override;

#ifdef WIN
    void _StartPage(PGNV pgnv, PSTN pstnDoc, int32_t lwPage, RC *prcPage, int32_t onn);
#endif // WIN

  public:
    static PHEDG PhedgNew(PHEDO phedo, PCFL pcfl, PGCB pgcb);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual void MouseDown(int32_t xp, int32_t yp, int32_t cact, uint32_t grfcust) override;
    virtual bool FCmdKey(PCMD_KEY pcmd) override;

    virtual void InvalCno(CNO cno);
    virtual bool FEnableHedgCmd(PCMD pcmd, uint32_t *pgrfeds);
    virtual bool FCmdNewTopic(PCMD pcmd);
    virtual bool FCmdEditTopic(PCMD pcmd);
    virtual bool FCmdDeleteTopic(PCMD pcmd);
    virtual bool FCmdExport(PCMD pcmd);
    virtual bool FCmdFind(PCMD pcmd);
    virtual bool FCmdPrint(PCMD pcmd);
    virtual bool FCmdCheckSpelling(PCMD pcmd);
    virtual bool FCmdDump(PCMD pcmd);

    PHEDO Phedo(void)
    {
        return (PHEDO)_pdocb;
    }
};

/***************************************************************************
    Help editor topic doc - for editing a single topic in a HEDO.
    An instance of this class is a child doc of a HEDO.
***************************************************************************/
#define HETD_PAR TXHD
#define kclsHETD KLCONST4('H', 'E', 'T', 'D')
class HETD : public HETD_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM

  protected:
    PCFL _pcfl; // which chunk is being edited
    CNO _cno;
    PGST _pgst;   // string versions of stuff in HTOP
    STN _stnDesc; // description

    HETD(PDOCB pdocb, PRCA prca, PCFL pcfl, CNO cno);
    ~HETD(void);

    virtual bool _FReadChunk(PCFL pcfl, CTG ctg, CNO cno, bool fCopyText) override;

  public:
    static PHETD PhetdNew(PDOCB pdocb, PRCA prca, PCFL pcfl, CNO cno);
    static PHETD PhetdFromChunk(PDOCB pdocb, CNO cno);
    static void CloseDeletedHetd(PDOCB pdocb);

    virtual PDMD PdmdNew(void) override;
    virtual PDDG PddgNew(PGCB pgcb) override;
    virtual void GetName(PSTN pstn) override;
    virtual bool FSave(int32_t cid) override;

    virtual bool FSaveToChunk(PCFL pcfl, CKI *pcki, bool fRedirectText = fFalse) override;

    void EditHtop(void);
    bool FDoFind(int32_t cpMin, int32_t *pcpMin, int32_t *pcpLim);
    bool FDoReplace(int32_t cp1, int32_t cp2, int32_t *pcpMin, int32_t *pcpLim);

    PHEDO Phedo(void)
    {
        return (PHEDO)PdocbPar();
    }
    CNO Cno(void)
    {
        return _cno;
    }

    void GetHtopStn(int32_t istn, PSTN pstn);
};

/***************************************************************************
    DDG for an HETD.  Help text document editing gob.
***************************************************************************/
typedef class HETG *PHETG;
#define HETG_PAR TXRG
#define kclsHETG KLCONST4('H', 'E', 'T', 'G')
class HETG : public HETG_PAR
{
    RTCLASS_DEC
    CMD_MAP_DEC(HETG)

  protected:
    HETG(PHETD phetd, PGCB pgcb);

    // clipboard support
    virtual bool _FCopySel(PDOCB *ppdocb = pvNil) override;

    // override these so we can put up our dialogs
    virtual bool _FGetOtherSize(int32_t *pdypFont) override;
    virtual bool _FGetOtherSubSuper(int32_t *pdypOffset) override;

    // we have our own ruler
    virtual int32_t _DypTrul(void) override;
    virtual PTRUL _PtrulNew(PGCB pgcb) override;

    // override _DrawLinExtra so we can put boxes around grouped text.
    virtual void _DrawLinExtra(PGNV pgnv, PRC prcClip, LIN *plin, int32_t dxp, int32_t yp, uint32_t grftxtg) override;

  public:
    static PHETG PhetgNew(PHETD phetd, PGCB pgcb);

    virtual void InvalCp(int32_t cp, int32_t ccpIns, int32_t ccpDel) override;

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FInsertPicture(PCRF pcrf, CTG ctg, CNO cno);
    virtual bool FInsertButton(PCRF pcrf, CTG ctg, CNO cno);

    virtual bool FCmdGroupText(PCMD pcmd);
    virtual bool FCmdFormatPicture(PCMD pcmd);
    virtual bool FCmdFormatButton(PCMD pcmd);
    virtual bool FEnableHetgCmd(PCMD pcmd, uint32_t *pgrfeds);
    virtual bool FCmdEditHtop(PCMD pcmd);
    virtual bool FCmdInsertEdit(PCMD pcmd);
    virtual bool FCmdFormatEdit(PCMD pcmd);
    virtual bool FCmdFind(PCMD pcmd);
    virtual bool FCmdPrint(PCMD pcmd);
    virtual bool FCmdLineSpacing(PCMD pcmd);
    virtual bool FCmdNextTopic(PCMD pcmd);
    virtual bool FCmdCheckSpelling(PCMD pcmd);
    virtual bool FCmdFontDialog(PCMD pcmd);

    virtual bool FCheckSpelling(int32_t *pcactChanges);

    PHETD Phetd(void)
    {
        return (PHETD)_ptxtb;
    }

    int32_t DypLine(int32_t ilin);
};

const int32_t kstidFind = 1;
const int32_t kstidReplace = 2;

/***************************************************************************
    The ruler for a help text document.
***************************************************************************/
typedef class HTRU *PHTRU;
#define HTRU_PAR TRUL
#define kclsHTRU KLCONST4('H', 'T', 'R', 'U')
class HTRU : public HTRU_PAR
{
    RTCLASS_DEC
    ASSERT

  protected:
    // ruler track type
    enum
    {
        rttNil,
        krttTab,
        krttDoc
    };

    PTXTG _ptxtg;
    int32_t _dxpTab;
    int32_t _dxpDoc;
    int32_t _dyp;
    int32_t _xpLeft;
    int32_t _dxpTrack;
    int32_t _rtt;
    int32_t _onn;
    int32_t _dypFont;
    uint32_t _grfont;

    HTRU(GCB *pgcb, PTXTG ptxtg);

  public:
    static PHTRU PhtruNew(GCB *pgcb, PTXTG ptxtg, int32_t dxpTab, int32_t dxpDoc, int32_t dypDoc, int32_t xpLeft,
                          int32_t onn, int32_t dypFont, uint32_t grfont);

    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd) override;

    virtual void SetDxpTab(int32_t dxpTab) override;
    virtual void SetDxpDoc(int32_t dxpDoc) override;
    virtual void SetXpLeft(int32_t xpLeft) override;

    virtual void SetDypHeight(int32_t dyp);
};

#endif //! CHELP_H
