ScriptName RP_PipBoyManager extends Quest
{Modular Pip-Boy, the game's half (RP_Pipboy.esp). The FMP server decides what a character may use
and ranks the player in RP_PipboyBlock; each bit of that rank turns one control off through an
InputEnableLayer, so the game itself refuses it instead of a script closing a menu after it opened.
See docs/resources/pipboy-mod.md for building, installing and testing.

Rank bits (server: src/server/pipboy.ts, kModBlock):
  1  V.A.T.S.
  2  the Pip-Boy and other menus (EnableMenu)
  4  the Pip-Boy's tabs (EnableJournal)
  8  fast travel
Not in the faction, or rank 0: nothing is blocked.}

Faction Property RP_PipboyBlock Auto Const Mandatory
{The faction the server ranks the player in. It has no relations: membership changes no hostility.}

Float Property PollSeconds = 0.5 Auto Const
{How often the rank is read again.}

Bool Property ShowNotifications = True Auto Const
{While testing: a HUD notification when the mod starts and whenever the blocks change.}

Int Property kBlockVATS = 1 AutoReadOnly
Int Property kBlockMenu = 2 AutoReadOnly
Int Property kBlockTabs = 4 AutoReadOnly
Int Property kBlockFastTravel = 8 AutoReadOnly

Int Property kTimerId = 1 AutoReadOnly

InputEnableLayer Layer
; The blocks last applied; -1 until the first.
Int Applied = -1

Event OnInit()
    Debug.Trace("[RP_PipBoy] started")
    If ShowNotifications
        Debug.Notification("RP Pip-Boy mod: loaded")
    EndIf
    StartTimer(PollSeconds, kTimerId)
EndEvent

Event OnTimer(Int aiTimerID)
    If aiTimerID == kTimerId
        Apply()
        StartTimer(PollSeconds, kTimerId)
    EndIf
EndEvent

; The blocks the server asks for now.
Int Function Wanted()
    Actor player = Game.GetPlayer()
    If player == None || !player.IsInFaction(RP_PipboyBlock)
        Return 0
    EndIf
    Int rank = player.GetFactionRank(RP_PipboyBlock)
    If rank < 0
        Return 0
    EndIf
    Return rank
EndFunction

Bool Function IsSet(Int mask, Int bit)
    Return Math.LogicalAnd(mask, bit) != 0
EndFunction

Function Apply()
    Int mask = Wanted()
    If mask == Applied
        Return
    EndIf
    If Layer == None
        Layer = InputEnableLayer.Create()
    EndIf
    Layer.EnableVATS(!IsSet(mask, kBlockVATS))
    Layer.EnableMenu(!IsSet(mask, kBlockMenu))
    Layer.EnableJournal(!IsSet(mask, kBlockTabs))
    Layer.EnableFastTravel(!IsSet(mask, kBlockFastTravel))
    Debug.Trace("[RP_PipBoy] blocks " + Applied + " -> " + mask)
    If ShowNotifications
        Debug.Notification("RP Pip-Boy: blocks " + mask)
    EndIf
    Applied = mask
EndFunction
