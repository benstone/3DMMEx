/* Copyright (c) Microsoft Corporation.
   Licensed under the MIT License. */

/***************************************************************************

    THIS IS A CODE REVIEWED FILE

    Basic scene classes:
        Scene (SCEN)

            BASE ---> SCEN

        Scene Actor Undo Object (SUNA)

            BASE ---> UNDB ---> MUNB ---> SUNA

***************************************************************************/

#ifndef SCEN_H
#define SCEN_H

//
// Undo object for actor operations
//
typedef class SUNA *PSUNA;

#define SUNA_PAR MUNB

// Undo types
enum
{
    utAdd = 0x1,
    utDel,
    utRep,
};

#define kclsSUNA KLCONST4('S', 'U', 'N', 'A')
class SUNA : public SUNA_PAR
{
    RTCLASS_DEC
    MARKMEM
    ASSERT

  protected:
    PACTR _pactr;
    int32_t _ut; // Tells which type of undo this is.
    SUNA(void)
    {
    }

  public:
    static PSUNA PsunaNew(void);
    ~SUNA(void);

    void SetActr(PACTR pactr)
    {
        _pactr = pactr;
    }
    void SetType(int32_t ut)
    {
        _ut = ut;
    }

    virtual bool FDo(PDOCB pdocb) override;
    virtual bool FUndo(PDOCB pdocb) override;
};

//
// Different reasons for pausing in a scene
//
enum WIT
{
    witNil,
    witUntilClick,
    witUntilSnd,
    witForTime,
    witLim
};

//
// Functionality that can be turned off and on.  If the bit
// is set, it is disabled.
//
enum
{
    fscenSounds = 0x1,
    fscenPauses = 0x2,
    fscenTboxes = 0x4,
    fscenActrs = 0x8,
    fscenPosition = 0x10,
    fscenAction = 0x20,
    fscenCams = 0x40,
    fscenAll = 0xFFFF
};

typedef struct SSE *PSSE;
typedef struct TAGC *PTAGC;

typedef class SCEN *PSCEN;

//
// Notes:
//
//	This assumes that struct SND contains at least,
//		- Everything necessary to play the sound.
//
//	This assumes that struct TBOX contains at least,
//		- Everything necessary to display the text.
//		- Enumerating through text boxes in a scene is not necessary.
//

#define SCEN_PAR BASE
#define kclsSCEN KLCONST4('S', 'C', 'E', 'N')
class SCEN : public SCEN_PAR
{
    RTCLASS_DEC
    MARKMEM
    ASSERT

  protected:
    typedef struct SEV *PSEV;

    //
    // These variables keep track of the internal frame numbers.
    //
    int32_t _nfrmCur;   // Current frame number
    int32_t _nfrmLast;  // Last frame number in scene.
    int32_t _nfrmFirst; // First frame number in scene.

    //
    // Frames with events in them.  This stuff works as follows.
    //   _isevFrmLim is the index into the GG of a sev with nfrm > nCurFrm.
    //
    PGG _pggsevFrm;      // List of events that occur in frames.
    int32_t _isevFrmLim; // Next event to process.

    //
    // Global information
    //
    STN _stnName;         // Name of this scene
    PGL _pglpactr;        // List of actors in the scene.
    PGL _pglptbox;        // List of text boxes in the scene.
    PGG _pggsevStart;     // List of frame independent events.
    PMVIE _pmvie;         // Movie this scene is a part of.
    PBKGD _pbkgd;         // Background for this scene.
    uint32_t _grfscen;    // Disabled functionality.
    PACTR _pactrSelected; // Currently selected actor, if any
    PTBOX _ptboxSelected; // Currently selected tbox, if any
    TRANS _trans;         // Transition at the end of the scene.
    PMBMP _pmbmp;         // The thumbnail for this scene.
    PSSE _psseBkgd;       // Background scene sound (starts playing
                          // at start time even if snd event is
                          // earlier)
    int32_t _nfrmSseBkgd; // Frame at which _psseBkgd starts
    TAG _tagBkgd;         // Tag to current BKGD

  protected:
    SCEN(PMVIE pmvie);
    ~SCEN(void);

    //
    // Event stuff
    //
    bool _FPlaySev(PSEV psev, void *qvVar, uint32_t grfscen); // Plays a single scene event.
    bool _FUnPlaySev(PSEV psev, void *qvVar);                 // Undoes a single scene event.
    bool _FAddSev(PSEV psev, int32_t cbVar, void *pvVar);     // Adds scene event to the current frame.
    void _MoveBackFirstFrame(int32_t nfrm);

    //
    // Dirtying stuff
    //
    void _MarkMovieDirty(void);
    void _DoPrerenderingWork(bool fStartNow); // Does any prerendering for _nfrmCur
    void _EndPrerendering(void);              // Stops prerendering

    //
    // Make actors go to a specific frame
    //
    bool _FForceActorsToFrm(int32_t nfrm, bool *pfSoundInFrame = pvNil);
    bool _FForceTboxesToFrm(int32_t nfrm);

    //
    // Thumbnail routines
    //
    void _UpdateThumbnail(void);

  public:
    //
    // Create and destroy
    //
    static SCEN *PscenNew(PMVIE pmvie);                      // Returns pvNil if it fails.
    static SCEN *PscenRead(PMVIE pmvie, PCRF pcrf, CNO cno); // Returns pvNil if it fails.
    bool FWrite(PCRF pcrf, CNO *pcno);                       // Returns fFalse if it fails, else the cno written.
    static void Close(PSCEN *ppscen);                        // Public destructor
    void RemActrsFromRollCall(bool fDelIfOnlyRef = fFalse);  // Removes actors from movie roll call.
    bool FAddActrsToRollCall(void);                          // Adds actors from movie roll call.

    //
    // Tag collection
    //
    static bool FAddTagsToTagl(PCFL pcfl, CNO cno, PTAGL ptagl);

    //
    // Frame functions
    //
    bool FPlayStartEvents(bool fActorsOnly = fFalse); // Play all one-time starting scene events.
    void InvalFrmRange(void);                         // Mark the frame count dirty
    bool FGotoFrm(int32_t nfrm);                      // Jumps to an arbitrary frame.
    int32_t Nfrm(void)                                // Returns the current frame number
    {
        return (_nfrmCur);
    }
    int32_t NfrmFirst(void) // Returns the number of the first frame in the scene.
    {
        return (_nfrmFirst);
    }
    int32_t NfrmLast(void) // Returns the number of the last frame in the scene.
    {
        return (_nfrmLast);
    }
    bool FReplayFrm(uint32_t grfscen); // Replay events in this scene.

    //
    // Undo accessor functions
    //
    void SetNfrmCur(int32_t nfrm)
    {
        _nfrmCur = nfrm;
    }

    //
    // Edit functions
    //
    void SetMvie(PMVIE pmvie); // Sets the associated movie.
    void GetName(PSTN pstn)    // Gets name of current scene.
    {
        *pstn = _stnName;
    }
    void SetNameCore(PSTN pstn) // Sets name of current scene.
    {
        _stnName = *pstn;
    }
    bool FSetName(PSTN pstn); // Sets name of current scene, and undo
    bool FChopCore(void);     // Chops off the rest of the scene.
    bool FChop(void);         // Chops off the rest of the scene and undo
    bool FChopBackCore(void); // Chops off the rest of the scene, backwards.
    bool FChopBack(void);     // Chops off the rest of the scene, backwards, and undo.

    //
    // Transition functions
    //
    void SetTransitionCore(TRANS trans) // Set the final transition to be.
    {
        _trans = trans;
    }
    bool FSetTransition(TRANS trans); // Set the final transition to be and undo.
    TRANS Trans(void)
    {
        return _trans;
    } // Returns the transition setting.
    // These two operate a specific SCEN chunk rather than a SCEN in memory
    static bool FTransOnFile(PCRF pcrf, CNO cno, TRANS *ptrans);
    static bool FSetTransOnFile(PCRF pcrf, CNO cno, TRANS trans);

    //
    // State functions
    //
    void Disable(uint32_t grfscen) // Disables functionality.
    {
        _grfscen |= grfscen;
    }
    void Enable(uint32_t grfscen) // Enables functionality.
    {
        _grfscen &= ~grfscen;
    }
    int32_t GrfScen(void) // Currently disabled functionality.
    {
        return _grfscen;
    }
    bool FIsEmpty(void); // Is the scene empty?

    //
    // Actor functions
    //
    bool FAddActrCore(ACTR *pactr); // Adds an actor to the scene at current frame.
    bool FAddActr(ACTR *pactr);     // Adds an actor to the scene at current frame, and undo
    void RemActrCore(int32_t arid); // Removes an actor from the scene.
    bool FRemActr(int32_t arid);    // Removes an actor from the scene, and undo
    PACTR PactrSelected(void)       // Returns selected actor
    {
        return _pactrSelected;
    }
    void SelectActr(ACTR *pactr);                               // Sets the selected actor
    PACTR PactrFromPt(int32_t xp, int32_t yp, int32_t *pibset); // Gets actor pointed at by the mouse.
    PGL PglRollCall(void)                                       // Return a list of all actors in scene.
    {
        return (_pglpactr);
    } // Only to be used by the movie-class
    void HideActors(void);
    void ShowActors(void);
    PACTR PactrFromArid(int32_t arid); // Finds a current actor in this scene.
    int32_t Cactr(void)
    {
        return (_pglpactr == pvNil ? 0 : _pglpactr->IvMac());
    }

    //
    // Sound functions
    //
    bool FAddSndCore(bool fLoop, bool fQueue, int32_t vlm, int32_t sty, int32_t ctag,
                     PTAG prgtag); // Adds a sound to the current frame.
    bool FAddSndCoreTagc(bool fLoop, bool fQueue, int32_t vlm, int32_t sty, int32_t ctagc, PTAGC prgtagc);
    bool FAddSnd(PTAG ptag, bool fLoop, bool fQueue, int32_t vlm,
                 int32_t sty);                             // Adds a sound to the current frame, and undo
    void RemSndCore(int32_t sty);                          // Removes the sound from current frame.
    bool FRemSnd(int32_t sty);                             // Removes the sound from current frame, and undo
    bool FGetSnd(int32_t sty, bool *pfFound, PSSE *ppsse); // Allows for retrieval of sounds.
    void PlayBkgdSnd(void);
    bool FQuerySnd(int32_t sty, PGL *pgltagSnd, int32_t *pvlm, bool *pfLoop);
    void SetSndVlmCore(int32_t sty, int32_t vlmNew);
    void UpdateSndFrame(void);
    bool FResolveAllSndTags(CNO cnoScen);

    //
    // Text box functions
    //
    bool FAddTboxCore(PTBOX ptbox);      // Adds a text box to the current frame.
    bool FAddTbox(PTBOX ptbox);          // Adds a text box to the current frame.
    bool FRemTboxCore(PTBOX ptbox);      // Removes a text box from the scene.
    bool FRemTbox(PTBOX ptbox);          // Removes a text box from the scene.
    PTBOX PtboxFromItbox(int32_t itbox); // Returns the ith tbox in this frame.
    PTBOX PtboxSelected(void)            // Returns the tbox currently selected.
    {
        return _ptboxSelected;
    }
    void SelectTbox(PTBOX ptbox); // Selects this tbox.
    void HideTboxes(void);        // Hides all text boxes.
    int32_t Ctbox(void)
    {
        return (_pglptbox == pvNil ? 0 : _pglptbox->IvMac());
    }

    //
    // Pause functions
    //
    bool FPauseCore(WIT *pwit, int32_t *pdts); // Adds\Removes a pause to the current frame.
    bool FPause(WIT wit, int32_t dts);         // Adds\Removes a pause to the current frame, and undo

    //
    // Background functions
    //
    bool FSetBkgdCore(PTAG ptag, PTAG ptagOld); // Sets the background for this scene.
    bool FSetBkgd(PTAG ptag);                   // Sets the background for this scene, and undo
    BKGD *Pbkgd(void)
    {
        return _pbkgd;
    }                                                     // Gets the background for this scene.
    bool FChangeCamCore(int32_t icam, int32_t *picamOld); // Changes camera viewpoint at current frame.
    bool FChangeCam(int32_t icam);                        // Changes camera viewpoint at current frame, and undo
    PMBMP PmbmpThumbnail(void);                           // Returns the thumbnail.
    bool FGetTagBkgd(PTAG ptag);                          // Returns the tag for the background for this scene

    //
    // Movie functions
    //
    PMVIE Pmvie()
    {
        return (_pmvie);
    } // Get the parent movie

    //
    // Mark scene as dirty
    //
    void MarkDirty(bool fDirty = fTrue); // Mark the scene as changed.

    //
    // Clipboard type functions
    //
    bool FPasteActrCore(PACTR pactr); // Pastes actor into current frame
    bool FPasteActr(PACTR pactr);     // Pastes actor into current frame and undo

    //
    // Playing functions
    //
    bool FStartPlaying(void); // For special behavior when playback starts
    void StopPlaying(void);   // Used to clean up after playback has stopped.
};

#endif //! SCEN_H
