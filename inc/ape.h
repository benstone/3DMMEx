/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    ape.h: Actor preview entity

    Primary Author: ******
    Review Status: REVIEWED - any changes to this file must be reviewed!

    BASE ---> CMH ---> GOB ---> APE

***************************************************************************/
#ifndef APE_H
#define APE_H

// APE tool types
enum
{
    aptNil = 0,
    aptIncCmtl,      // Increment CMTL
    aptIncAccessory, // Increment Accessory
    aptGms,          // Material (MTRL or CMTL)
    aptLim
};

// Generic material spec
struct GMS
{
    bool fValid; // if fFalse, ignore this GMS
    bool fMtrl;  // if fMtrl is fTrue, tagMtrl is valid.  Else cmid is valid
    int32_t cmid;
    TAG tagMtrl;
};

// Actor preview entity tool
struct APET
{
    int32_t apt;
    GMS gms;
};

/****************************************
    Actor preview entity class
****************************************/
typedef class APE *PAPE;
#define APE_PAR GOB
#define kclsAPE KLCONST3('A', 'P', 'E')
class APE : public APE_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
    CMD_MAP_DEC(APE)

  protected:
    PBWLD _pbwld;          // BRender world to draw actor in
    PTMPL _ptmpl;          // Template (or TDT) of the actor being previewed
    PBODY _pbody;          // Body of the actor being previewed
    APET _apet;            // Currently selected tool
    PGL _pglgms;           // What materials are attached to what body part sets
    int32_t _celn;         // Current cel of action
    CLOK _clok;            // To time cel cycling
    BLIT _blit;            // BRender light data
    BACT _bact;            // BRender light actor
    int32_t _anid;         // Current action ID
    int32_t _iview;        // Current camera view
    bool _fCycleCels;      // If cycling cels
    PRCA _prca;            // resource source (for cursors)
    int32_t _ibsetOnlyAcc; // ibset of accessory, if only one (else ivNil)

  protected:
    APE(PGCB pgcb) : GOB(pgcb), _clok(CMH::HidUnique())
    {
    }
    bool _FInit(PTMPL ptmpl, PCOST pcost, int32_t anid, bool fCycleCels, PRCA prca);
    void _InitView(void);
    void _SetScale(void);
    void _UpdateView(void);
    bool _FApplyGms(GMS *pgms, int32_t ibset);
    bool _FIncCmtl(GMS *pgms, int32_t ibset, bool fNextAccessory);
    int32_t _CmidNext(int32_t ibset, int32_t icmidCur, bool fNextAccessory);

  public:
    static PAPE PapeNew(PGCB pgcb, PTMPL ptmpl, PCOST pcost, int32_t anid, bool fCycleCels, PRCA prca = pvNil);
    ~APE();

    void SetToolMtrl(PTAG ptagMtrl);
    void SetToolCmtl(int32_t cmid);
    void SetToolIncCmtl(void);
    void SetToolIncAccessory(void);

    bool FSetAction(int32_t anid);
    bool FCmdNextCel(PCMD pcmd);

    void SetCustomView(BRA xa, BRA ya, BRA za);
    void ChangeView(void);
    virtual void Draw(PGNV pgnv, RC *prcClip) override;
    virtual bool FCmdMouseMove(PCMD_MOUSE pcmd) override;
    virtual bool FCmdTrackMouse(PCMD_MOUSE pcmd) override;

    bool FChangeTdt(PSTN pstn, int32_t tdts, PTAG ptagTdf);
    bool FSetTdtMtrl(PTAG ptagMtrl);
    bool FGetTdtMtrlCno(CNO *pcno);

    void GetTdtInfo(PSTN pstn, int32_t *ptdts, PTAG ptagTdf);
    int32_t Anid(void)
    {
        return _anid;
    }
    int32_t Celn(void)
    {
        return _celn;
    }
    void SetCycleCels(bool fOn);
    bool FIsCycleCels(void)
    {
        return _fCycleCels;
    }
    bool FDisplayCel(int32_t celn);
    int32_t Cbset(void)
    {
        return _pbody->Cbset();
    }

    // Returns fTrue if a material was applied to this ibset
    bool FGetMaterial(int32_t ibset, tribool *pfMtrl, int32_t *pcmid, TAG *ptagMtrl);
};

#endif // APE_H
