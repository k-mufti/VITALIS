"""What Vitaly says for each injury, written to be spoken to a person, not read as a checklist.

The facts are the injury drill's (src/ui/injury-library.js, via injury_data.json): same actions, same order of care,
same warning signs. The wording is a companion talking someone through it: it says why, narrates each move, checks in,
and puts the warning signs in plain speech.

{a|b} marks a spot that changes with who is hurt: a is for the speaker ("you"), b is for helping someone else ("them").
Everything else is the same for both. Nothing here waits on a call to Earth.
"""

SAY = {
    "self": "Okay. I'm right here with you. We'll take care of this together, one step at a time.",
    "other": "Okay. I'm here, and I'll walk you through helping them. Take a breath. We'll go one step at a time.",
}

# id -> (opening line for you, opening line for them, steps). An opening of None uses SAY.
VOICE = {
    "sprain": (None, None, [
        "First thing: {stop using it|have them stop using it}. {Don't try to walk it off or test it|Don't let them try to walk it off or test it}. "
        "Anchor {yourself|them} to a handrail or foot loop so {you're|they're} not moving it around. Say next when {you're|they're} settled.",
        "Good. Now let's bring the swelling down. Get the cold pack from the med kit and wrap it in a cloth first, so it doesn't sit right on the skin. "
        "Hold it on the sore spot for fifteen minutes.",
        "While that's on, here's the plan for the next day or two: cold again every two to three hours. The swelling causes most of the pain, "
        "so staying on top of it really helps.",
        "When the fifteen minutes are up, take the cold pack off and wrap the area with the elastic bandage. Firm, so it feels supported, "
        "but not tight. You don't want it cutting off the blood flow.",
        "Let's make sure the wrap isn't too tight. Look just past it. {Your|Their} toes or fingers should be warm and pink, and {you|they} "
        "should be able to feel your touch. {Tell me what you find|Check, and tell me what you find}.",
        "If it hurts a lot, pain medicine from the kit is fine, the way the flight surgeon's protocol sets it out. "
        "After two days, start moving it gently, as long as the pain allows.",
        "Here's what I want you to watch for. If {you felt|they felt} a pop and now it won't work, if {you can't|they can't} move it at all, "
        "or if the swelling comes up fast or it starts turning purple, tell me right away. Those could mean it's more than a sprain.",
        "One more thing about space. Muscles get weaker after months up here, so they tear more easily. Go easy on it, "
        "and no heavy exercise with this part for three days.",
    ]),
    "dislocation": (
        "Okay. Stay calm, I'm right here. We'll be careful with this one, one step at a time.",
        "Okay. Stay calm, I'm here and I'll talk you through it. We'll be gentle, and go one step at a time.",
        [
            "The most important thing first: do not try to push it back in. I know it's tempting, but moving it can do real damage. "
            "Keep it exactly the way you found it.",
            "Now support it in that position. Use a sling or a splint from the med kit, so the joint can't move around. Say next when it's supported.",
            "Let's check past the joint. {Your|Their} fingers or toes should be warm and pink, and {you|they} should be able to feel your touch. "
            "If it's cold, numb or going blue, tell me straight away.",
            "Next, a cold pack wrapped in cloth, held on for fifteen minutes. It'll ease the pain and the swelling.",
            "Something odd about space: without weight pulling on it, a joint can look fine even when it isn't. "
            "So compare it with the other side, and see if it looks different.",
            "Keep it supported and still, and don't force it back in. Pain medicine from the kit can help, if {you need|they need} it.",
            "I want you to watch for two things: it turning cold, numb or blue past the joint, or the pain getting worse fast. "
            "If either happens, tell me right away.",
            "No exercise with this joint until the flight surgeon clears it.",
        ]),
    "nosebleed": (
        "Okay. Nosebleeds are really common up here, so don't worry. I'll talk you through it.",
        "Okay. This looks scarier than it is, because nosebleeds are common in space. I'll talk you through helping them.",
        [
            "First, {lean|have them lean} forward, not back. Leaning back just sends the blood down the throat. "
            "And in space, blood can float, so we'll catch it as we go.",
            "Get a piece of gauze and hold it under the nose, to catch what's coming so it doesn't float away.",
            "Now {pinch|have them pinch} the soft part of the nose, just below the bony bridge, and hold it for ten to fifteen minutes. "
            "Breathe through the mouth. Try not to let go to check. It's worth the full time.",
            "While {you're|they're} holding, put a cold pack on the bridge of the nose. That helps the blood vessels settle down.",
            "Once it stops, no blowing the nose for a few hours. That could start it bleeding again.",
            "It helps to know why this happens: in space, fluid shifts toward the head, so nosebleeds are more common. "
            "And blood can float into the eyes, so keep that gauze close.",
            "Watch for these. If it hasn't stopped after twenty minutes, or it came after a hit to the head, or {you feel|they feel} faint, tell me right away.",
        ]),
    "puncture": (
        "Okay. I'm with you. Keep as still as you can and listen to me. We'll go carefully.",
        "Okay. I'm here. Keep them as still as you can. We'll go carefully, one step at a time.",
        [
            "First, {anchor yourself|anchor yourself and them} to a handrail or the foot loops, so nothing shifts while we work.",
            "Now the most important rule: do not pull out anything that's stuck in the skin. Pulling it out can make the bleeding much worse.",
            "Put on gloves from the kit. Then press gauze around the object, not on it. That slows the bleeding without pushing it deeper.",
            "Pad around the object with more gauze, and tape it down so it can't move. Say next when it's secure.",
            "Leave it exactly where it is. Taking it out can wait.",
            "In space, loose fragments can float into eyes and air filters. If any pieces come free, bag every one of them.",
            "Watch for bleeding that won't slow down, anything in the chest or belly, or trouble breathing. If you see any of those, tell me right away.",
        ]),
    "back": (
        "Okay. Back pain is really common up here. I'll talk you through it, and we'll ease it out.",
        "Okay. Back pain is really common in space. I'll walk you through helping them ease it.",
        [
            "Let's start with a gentle stretch. {Curl up|Have them curl up}: pull the knees toward the chest and hold for thirty seconds. Breathe slowly.",
            "{Do that|Have them do that} five times in total, then stretch out slowly. Don't rush it. Say next when that's done.",
            "Good. Now a warm pack on the sore spot for fifteen minutes. Heat helps the muscles let go.",
            "If it's still aching, pain medicine from the kit is fine.",
            "No heavy lifting on the resistance machine today. Give the back a day to settle.",
            "It helps to know why: in space the spine stretches by up to five centimetres, which strains the discs. "
            "Most crew get back pain early on, so this is very normal.",
            "Watch for numb or weak legs, losing control of the bladder or bowels, or pain after a hit or a fall. "
            "Those aren't the usual kind, so tell me right away.",
        ]),
    "nail": (
        "Okay. That's a sore one, but it's easy to look after. I'll talk you through it.",
        "Okay. That's a sore one, but it's easy to look after. I'll talk you through helping them.",
        [
            "First, clean the finger with sterile water from the kit.",
            "If any part of the nail is loose, trim it with the clippers so it can't catch on anything.",
            "Cover it with a small dressing and tape it on. Snug, not tight. Say next when that's done.",
            "Keep it dry, and change the dressing every day.",
            "Spacewalk gloves press on the fingertips, and that can lift nails off. That's why this happens.",
            "Watch for redness, heat, or pus under the nail, or the whole nail lifting off. Tell me if you see any of those.",
            "No spacewalks until the nail has healed and the glove fit has been checked.",
        ]),
    "ear": (
        "Okay. Ear pressure is uncomfortable, but we can ease it. I'm right here.",
        "Okay. Ear pressure is uncomfortable, but we can ease it. I'm here, and I'll talk you through helping them.",
        [
            "First, stop any pressure change. If {you're|they're} in the airlock or the suit, hold the pressure right where it is for now.",
            "Now let's even out the pressure. {Swallow, or yawn|Have them swallow, or yawn}. If that doesn't do it, "
            "{pinch|have them pinch} the nose and blow very gently.",
            "Don't put anything in the ear. Not a finger, not a swab.",
            "If it aches, pain medicine from the kit can help.",
            "Let's test the hearing. Rub your fingers beside one ear, then the other, and compare. Tell me if one sounds different.",
            "In space, airlock and suit pressure changes squeeze the eardrum, and a head cold makes it worse, because the sinuses can't drain.",
            "Watch for blood or fluid coming from the ear, spinning dizziness or vomiting, or hearing loss that doesn't come back. "
            "If any of those happen, tell me right away.",
            "No spacewalks or airlock use until the ear clears.",
        ]),
    "kidney": (
        "Okay. That sounds very painful. I'm right here, and we'll get you through it.",
        "Okay. That sounds very painful for them. I'm here, and we'll get them through it together.",
        [
            "First, water. {Drink|Have them drink} two to three litres through the day. It helps flush the stone through.",
            "Pain medicine from the kit, the way the flight surgeon's protocol sets it out.",
            "{Collect your urine|Have them collect their urine} in the sample bag, so we can catch the stone when it passes.",
            "Take {your|their} temperature. A fever changes the plan, so tell me what it reads.",
            "Rest, strapped in, and keep drinking water.",
            "It helps to know why this happens: in space, calcium lost from the bones goes through the kidneys, and it can form stones.",
            "Watch for fever or chills, not being able to pee, vomiting, or pain that the medicine doesn't touch. If any of those happen, tell me right away.",
        ]),
    "bends": (
        "Okay. This is serious, but we know what to do, and I'm right here. Stay calm and do exactly what I say, one step at a time.",
        "Okay. This is serious, but we know what to do. Stay calm. I'll talk you through helping them.",
        [
            "First, {put|get them to put} on the oxygen mask. Pure oxygen, tight fit. This is the most important step, so do it now.",
            "Now get back in the suit and raise its pressure. The suit becomes a pressure chamber, and that helps the bubbles dissolve.",
            "Stay still. Don't rub or exercise the sore joint, even if it's tempting.",
            "Every ten minutes, check vision, strength and feeling. Tell me what you notice.",
            "Here's why this happens: spacewalk suits run at low pressure, so nitrogen in the blood can form bubbles, most often in the shoulders and elbows.",
            "Watch for confusion or slurred speech, blurry vision, trouble breathing, or numb or weak arms or legs. "
            "Those mean it's getting worse, so tell me right away.",
            "No spacewalks until it's been cleared.",
        ]),
    "radiation": (
        "Okay. I'm with you. First we get you to shelter. Move now.",
        "Okay. I'm here. First we get them to shelter. Move now.",
        [
            "Go to the storm shelter now: the area walled with water and supplies. The water is what blocks the radiation.",
            "Once {you're|they're} inside, write down the dosimeter reading.",
            "Take anti-sickness medicine from the kit.",
            "Drink water, and rest. Let the body do its work.",
            "In the next few days, the flight surgeon will want a blood sample. Just keep that in mind for later.",
            "Out past Earth's magnetic field, a solar storm can deliver a big dose in just hours. That's why shelter comes first.",
            "Watch for vomiting within hours of the dose, bleeding gums or bruising easily, or a fever. Tell me if you see any of those.",
            "Stay in the shelter until the storm passes.",
        ]),
    "cold": (
        "Okay. Cold fingers can be fixed. We'll warm them up slowly. I'm right here.",
        "Okay. Cold fingers can be fixed. We'll warm them up slowly. I'm here, and I'll talk you through it.",
        [
            "Warm the fingers slowly. Tuck them into {your|their} armpits.",
            "Don't rub them. Rubbing can damage skin that's already been through the cold.",
            "If you can, soak them in warm water, thirty-seven to thirty-nine degrees, for twenty minutes.",
            "Then wrap each finger loosely in dry gauze.",
            "Rewarming hurts, so take pain medicine from the kit. That's normal, it means the blood is coming back.",
            "Here's why this happens: in shadow, spacewalk gloves face minus one hundred and fifty degrees. If a glove heater fails, the fingertips go first.",
            "Watch for skin that's hard, white or grey, blisters, or fingers that are still numb after warming. Tell me if you see any of those.",
            "No spacewalks until the fingers have been checked.",
        ]),
    "crush": (
        "Okay. Ouch. Let's look after it. I'm right here.",
        "Okay. Ouch. Let's look after it. I'm here, and I'll talk you through helping them.",
        [
            "First, free it gently. Take your time. Don't yank.",
            "Look at the shape. If it's bent or out of place, treat it as a break and keep it still.",
            "Wrap a cold pack in cloth and hold it on for fifteen minutes. Say next when that's done.",
            "Check the nail. If there's dark blood underneath, it needs the flight surgeon to look at it.",
            "If it hurts to move, tape it to the next finger for support.",
            "In space, hatches and heavy gear still have full mass. They move slowly, but they stop hard.",
            "Watch for it looking misshapen or not bending, a deep cut with it, or numbness past the injury. Tell me if you see any of those.",
        ]),
    "tooth": (
        "Okay. A toothache is miserable, but we can ease it. I'm right here.",
        "Okay. A toothache is miserable, but we can ease it. I'm here, and I'll talk you through helping them.",
        [
            "Start by rinsing the mouth with warm salt water.",
            "Take pain medicine from the kit.",
            "If a filling has come out, pack the hole with temporary filling from the dental kit. Say next when that's done.",
            "For the pain, put clove oil on a cotton swab and dab it on the sore spot.",
            "Stick to soft food, and chew on the other side.",
            "The nearest dentist is months away, which is why crew learn basic dental care before flight. You're doing it right.",
            "Watch for swelling in the face or jaw, a fever, or a bad taste or pus. Tell me if you see any of those.",
        ]),
    "rash": (
        "Okay. Rashes are really common up here, so try not to worry. I'll talk you through it.",
        "Okay. Rashes are really common in space, so try not to worry. I'll talk you through helping them.",
        [
            "First, clean the skin gently and pat it dry.",
            "Put on a thin layer of hydrocortisone cream. Twice a day is fine.",
            "Wear loose clothing over it.",
            "Take a photo with the camera, so the flight surgeon can look at it later.",
            "In space, skin gets thin and dry and heals more slowly. Rashes are one of the most common complaints, so this is very normal.",
            "Watch for it spreading fast, blisters or open skin, or a fever. Tell me if you see any of those.",
        ]),
    "bruise": (
        "Okay. A bump like that is nothing to worry about. I'll talk you through it.",
        "Okay. A bump like that is usually nothing to worry about. I'll talk you through helping them.",
        [
            "Wrap a cold pack in cloth and hold it on for fifteen minutes.",
            "Check that it moves normally, and isn't misshapen.",
            "Compare it with the other side, so you can see the difference.",
            "Check again in two hours. If it swells, use the cold pack again.",
            "In space, loose objects keep moving. Strap down whatever hit {you|them}, so it doesn't happen again.",
            "Watch for fast swelling, not being able to move it, or pain that's getting worse instead of better. Tell me if you see any of those.",
        ]),
    "shock": (
        "Okay. Electric shock. Stay calm, I'm with you, and we'll check {you|them} carefully.",
        "Okay. Electric shock. Stay calm. First make sure the power is off. I'll talk you through it.",
        [
            "First, cut the power before you touch {anything else|them}. That's the most important step. We don't want a second casualty.",
            "Check {that you're awake and breathing normally. If you feel faint, or your chest feels strange, stay braced and tell me right away|"
            "they're awake and breathing. If they're not breathing, or there's no pulse, start CPR now and get the AED: strap them to the floor "
            "and brace your feet on the ceiling}.",
            "Take {your|their} heart rate, and watch for an uneven beat.",
            "Look for burns where the current went in and where it came out. Cover any you find with a burn dressing from the kit.",
            "Even if {you feel|they feel} fine, keep {resting|them resting}. A shock can cause trouble hours later.",
            "Watch for an uneven heartbeat or burns on the skin. If you see either, tell me right away.",
        ]),
}
