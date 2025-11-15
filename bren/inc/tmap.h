/*************************************************************************

    Texture map (TMAP)

    This manages I/O and caching for BPMPs

*************************************************************************/
#ifndef TMAP_H
#define TMAP_H

const CTG kctgTmap = KLCONST4('T', 'M', 'A', 'P');
const CTG kctgTxxf = KLCONST4('T', 'X', 'X', 'F');

// tmap on file
struct TMAPF
{
    int16_t bo;
    int16_t osk;
    int16_t cbRow;
    uint8_t type;
    uint8_t grftmap;
    int16_t xpLeft;
    int16_t ypTop;
    int16_t dxp;
    int16_t dyp;
    int16_t xpOrigin;
    int16_t ypOrigin;
    // void *rgb; 		// pixels follow immediately after TMAPF
};
VERIFY_STRUCT_SIZE(TMAPF, 20);
const uint32_t kbomTmapf = 0x54555000;

/* A TeXture XransForm on File */
typedef struct _txxff
{
    int16_t bo;  // byte order
    int16_t osk; // OS kind
    BMAT23 bmat23;
} TXXFF, *PTXXFF;
VERIFY_STRUCT_SIZE(TXXFF, 28);
const BOM kbomTxxff = 0x5FFF0000;

// REVIEW *****: should TMAPs have shade table chunks under them, or
//   is the shade table a global animal?  Right now it's global.

/****************************************
    The TMAP class
****************************************/
typedef class TMAP *PTMAP;
#define TMAP_PAR BACO
#define kclsTMAP KLCONST4('T', 'M', 'A', 'P')
class TMAP : public TMAP_PAR
{
    RTCLASS_DEC
    ASSERT
    MARKMEM
  protected:
    BPMP _bpmp;
    bool _fImported; // if fTrue, BRender allocated the pixels
                     // if fFalse, we allocated the pixels
  protected:
    TMAP(void)
    {
    } // can't instantiate directly; must use PtmapRead
#ifdef NOT_YET_REVIEWED
    void TMAP::_SortInverseTable(uint8_t *prgb, int32_t cbRgb, BRCLR brclrLo, BRCLR brclrHi);
#endif // NOT_YET_REVIEWED
  public:
    ~TMAP(void);

    //  REVIEW *****(peted): MBMP's ...Read function just takes a PBLCK; this
    //  is more like the FRead... function, just without the BACO stuff.  Why
    //  the difference?
    //	Addendum: to enable compiling 'TMAP' chunks, I added an FWrite that does
    //	take just a PBLCK.  Should this be necessary for PtmapRead in the future,
    //	it's a simple matter of extracting the code in PtmapRead that is needed,
    //	like I did for FWrite.
    static PTMAP PtmapRead(PCFL pcfl, CTG ctg, CNO cno);
    bool FWrite(PCFL pcfl, CTG ctg, CNO *pcno);

    //	a chunky resource reader for a TMAP
    static bool FReadTmap(PCRF pcrf, CTG ctg, CNO cno, PBLCK pblck, PBACO *ppbaco, int32_t *pcb);

    //	Given a BPMP (a Brender br_pixelmap), create a TMAP
    static PTMAP PtmapNewFromBpmp(BPMP *pbpmp);

    //	Give back the bpmp for this TMAP
    BPMP *Pbpmp(void)
    {
        return &_bpmp;
    }

    //	Reads a .bmp file.
    static PTMAP PtmapReadNative(FNI *pfni, PGL pglclr = pvNil);

    // Writes a standalone TMAP-chunk file (not a .chk)
    bool FWriteTmapChkFile(PFNI pfniDst, bool fCompress, PMSNK pmsnkErr = pvNil);

    // Creates a TMAP from the width, height, and an array of bytes
    static PTMAP PtmapNew(uint8_t *prgbPixels, int32_t dxWidth, int32_t dxHeight);

    // Some useful file methods
    int32_t CbOnFile(void) override
    {
        return (SIZEOF(TMAPF) + LwMul(_bpmp.row_bytes, _bpmp.height));
    }
    bool FWrite(PBLCK pblck) override;

#ifdef NOT_YET_REVIEWED
    // Useful shade-table type method
    uint8_t *PrgbBuildInverseTable(void);
#endif // NOT_YET_REVIEWED
};

#endif // TMAP_H
