# Task: Review code with N+1 query problem

Review the following Python code for issues:

```python
@router.get("/teams/{team_id}/report")
async def get_team_report(team_id: int, db: AsyncSession):
    team = await db.get(Team, team_id)
    members = await db.execute(select(User).where(User.team_id == team_id))

    report = []
    for member in members.scalars():
        posts = await db.execute(
            select(Post).where(Post.author_id == member.id)
        )
        post_count = len(posts.scalars().all())
        last_post = await db.execute(
            select(Post)
            .where(Post.author_id == member.id)
            .order_by(Post.created_at.desc())
            .limit(1)
        )
        report.append({
            "name": member.name,
            "post_count": post_count,
            "last_post": last_post.scalar_one_or_none(),
        })

    return {"team": team.name, "members": report}
```

Provide a thorough code review focusing on performance.
