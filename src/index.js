const admin = require('firebase-admin')
const { join } = require('path')

const CREDENTIAL_PATH = join(__dirname, '..', 'protected', 'firebase-admin.json')
const SUPPORT_ID = 's6yreK4ZTRfIjxiYsch0ze1YnR93'

admin.initializeApp({
	credential: admin.credential.cert(CREDENTIAL_PATH),
	storageBucket: 'memorize-ai.appspot.com'
})

const firestore = admin.firestore()
const { minCards } = require('./settings.json')

;(async () => {
	const { docs: userSnapshots } = await firestore.collection('users').get()
	
	const _users = await Promise.all(
		userSnapshots
			.filter(snapshot => snapshot.exists && snapshot.id !== SUPPORT_ID)
			.map(async user => {
				const { docs: deckSnapshots } = await firestore
					.collection('decks')
					.where('creator', '==', user.id)
					.get()
				
				const isPowerUser = deckSnapshots.some(snapshot =>
					snapshot.exists && snapshot.get('cardCount') >= minCards
				)
				
				if (!isPowerUser)
					return null
				
				const decks = await Promise.all(
					deckSnapshots
						.filter(({ exists }) => exists)
						.map(async deck => {
							const topics = await Promise.all(
								(deck.get('topics') || []).map(topicId =>
									firestore.doc(`topics/${topicId}`).get()
								)
							)
							
							return {
								url: `https://memorize.ai/d/${deck.get('slugId')}/${deck.get('slug')}`,
								id: deck.id,
								name: deck.get('name'),
								subtitle: deck.get('subtitle'),
								description: deck.get('description'),
								topics: topics.map(topic => topic.get('name')),
								cardCount: deck.get('cardCount')
							}
						})
				)
				
				return {
					id: user.id,
					name: user.get('name'),
					email: user.get('email'),
					cardCount: decks.reduce((acc, { cardCount }) => (
						acc + cardCount
					), 0),
					decks
				}
			})
	)
	
	const users = _users
		.filter(Boolean)
		.sort((a, b) => b.cardCount - a.cardCount)
	
	for (const user of users)
		console.log([
			`- ID: ${user.id}`,
			`  Name: ${user.name}`,
			`  Email: ${user.email}`,
			`  Total created cards: ${user.cardCount}`,
			`  Created decks (${user.decks.length}):`,
			...user.decks.map(deck => [
				`- URL: ${deck.url}`,
				`  ID: ${deck.id}`,
				`  Name: ${deck.name}`,
				`  Subtitle: ${deck.subtitle || '(empty)'}`,
				`  Description: ${deck.description || '(empty)'}`,
				`  Topics: ${deck.topics.length ? deck.topics.join(', ') : '(none)'}`,
				`  Cards: ${deck.cardCount}`
			].map(line => `    ${line}`).join('\n'))
		].join('\n'))
})()
